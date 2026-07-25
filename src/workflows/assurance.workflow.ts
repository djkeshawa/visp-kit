import {
  assuranceCaseArtifactPath,
  assuranceCaseMarkdownPath,
  diffSnapshotArtifactPath
} from "../artifacts/artifact-paths.js";
import {
  assuranceCaseSchema,
  type AssuranceCase
} from "../artifacts/schemas/assurance-case.schema.js";
import {
  diffSnapshotSchema,
  type DiffSnapshot
} from "../artifacts/schemas/diff-snapshot.schema.js";
import { buildAssuranceCase } from "../assurance/assurance-case.js";
import { renderAssuranceCase } from "../assurance/assurance-case-renderer.js";
import { loadAssuranceInputs, type AssuranceInputs } from "../assurance/assurance-inputs.js";
import { mapAssuranceClaims } from "../assurance/claim-mapper.js";
import { captureDiffSnapshot, assuranceChangeUnits } from "../assurance/diff-snapshot.js";
import { buildEvidenceComparisons } from "../assurance/evidence-comparison.js";
import { detectAssuranceHotspots } from "../assurance/hotspot-detectors.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { relativePath, resolvePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { runNextWorkflow } from "./next.workflow.js";
import { writeUpdatedGeneratedFiles, type WorkflowFileAction } from "./shared/generated-files.js";

export type AssuranceWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly targetRevision?: string;
  readonly dryRun?: boolean;
  readonly commandRunner?: CommandRunner;
  readonly now?: string;
};

export type AssuranceWorkflowSummary = {
  readonly success: true;
  readonly taskId: string;
  readonly mode: DiffSnapshot["mode"];
  readonly verdict: AssuranceCase["verdict"];
  readonly caseHash: string;
  readonly snapshotHash: string;
  readonly actions: readonly WorkflowFileAction[];
  readonly dryRun: boolean;
  readonly nextCommand: string;
};

function assuranceInputIdentity(input: {
  readonly inputs: AssuranceInputs;
  readonly actionId: string;
}): `sha256:${string}` {
  return hashOracleValue(
    JSON.parse(
      JSON.stringify({
        version: "1.0",
        inputs: input.inputs,
        actionId: input.actionId
      })
    )
  );
}

export async function runAssuranceWorkflow(
  options: AssuranceWorkflowOptions
): Promise<Result<AssuranceWorkflowSummary, VispError>> {
  const mode = options.targetRevision === undefined ? "base_to_workspace" : "base_to_commit";
  const effectiveNow = options.now ?? new Date().toISOString();
  let targetRevision = options.targetRevision;
  if (targetRevision !== undefined) {
    const resolved = await (options.commandRunner ?? defaultCommandRunner).run(
      "git",
      ["rev-parse", "--verify", `${targetRevision}^{commit}`],
      { cwd: resolvePath(options.cwd ?? process.cwd(), options.targetPath ?? ".") }
    );
    const commit = resolved.ok ? resolved.value.stdout.trim() : "";
    if (!resolved.ok || resolved.value.exitCode !== 0 || !/^[a-f0-9]{40,64}$/u.test(commit)) {
      return err(
        new VispError("VALIDATION_FAILED", `Invalid committed assurance target: ${targetRevision}.`)
      );
    }
    targetRevision = commit;
  }
  const normalizedOptions = { ...options, targetRevision, now: effectiveNow };
  const loaded = await loadAssuranceInputs({ ...normalizedOptions, mode });
  if (!loaded.ok) return loaded;
  const plan = loaded.value.authorization.plan;
  if (plan.baseCommit.status !== "captured") {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Assurance requires a captured base commit: ${plan.baseCommit.reason}`
      )
    );
  }
  const snapshot = await captureDiffSnapshot({
    targetPath: loaded.value.state.targetPath,
    mode,
    baseRevision: plan.baseCommit.commit,
    targetRevision,
    commandRunner: options.commandRunner
  });
  if (!snapshot.ok) return snapshot;

  const next = await runNextWorkflow({
    ...normalizedOptions,
    protocol: "3.1"
  });
  if (!next.ok) return next;
  if (!("actionId" in next.value.action)) {
    return err(
      new VispError("VALIDATION_FAILED", "Assurance requires workflow action protocol 3.1.")
    );
  }
  const initialInputIdentity = assuranceInputIdentity({
    inputs: loaded.value,
    actionId: next.value.action.actionId
  });
  const changeUnits = assuranceChangeUnits(snapshot.value);
  const mapping = mapAssuranceClaims({
    task: loaded.value.state.selectedTask,
    spec: loaded.value.state.spec,
    traceability: loaded.value.state.traceability,
    oraclePlan: plan,
    changeUnits
  });
  if (!mapping.ok) return mapping;
  const comparisons = buildEvidenceComparisons({
    oracles: plan.oracles,
    claims: mapping.value.claims,
    baseline: loaded.value.authorization.baselineEvidence,
    candidate: loaded.value.candidate,
    baselineBindingId: "BIND-baseline-evidence",
    candidateBindingId: "BIND-candidate-evidence",
    baselineIssue: loaded.value.baselineIssue,
    candidateIssue: loaded.value.candidateIssue,
    requiredProviders: plan.requiredProviders
  });
  const patchByChangeUnitId = Object.fromEntries(
    snapshot.value.changeUnits.flatMap((unit) =>
      unit.kind === "hunk" ? [[unit.id, unit.patch] as const] : []
    )
  );
  const hotspots = detectAssuranceHotspots({
    changeUnits,
    claims: mapping.value.claims,
    evidenceComparisons: comparisons,
    task: loaded.value.state.selectedTask,
    oraclePlan: plan,
    overrides: loaded.value.overrides,
    unmappedChangeUnitIds: mapping.value.unmappedChangeUnitIds,
    patchByChangeUnitId
  });
  const bindings = loaded.value.bindings.map((binding) =>
    binding.role === "diff_snapshot"
      ? { ...binding, sha256: snapshot.value.snapshotSha256 }
      : binding
  );
  const built = buildAssuranceCase({
    actionId: next.value.action.actionId as `sha256:${string}`,
    featureId: loaded.value.state.selectedFeature.id,
    featureSlug: loaded.value.state.selectedFeature.slug,
    taskId: loaded.value.state.selectedTask.id,
    assuranceProfile: plan.assuranceProfile,
    bindings,
    baselineState: {
      status: "captured",
      revision: plan.baseCommit.commit,
      sha256: hashOracleValue({ revision: plan.baseCommit.commit })
    },
    snapshot: snapshot.value,
    claims: mapping.value.claims,
    comparisons,
    hotspots,
    spec: loaded.value.state.spec,
    unresolvedItems: mapping.value.unresolvedItems,
    overrides: loaded.value.overrides
  });
  if (!built.ok) return built;

  const targetPath = loaded.value.state.targetPath;
  const featureKey = loaded.value.state.selectedFeature.key;
  const taskId = loaded.value.state.selectedTask.id;
  const snapshotPath = diffSnapshotArtifactPath(targetPath, featureKey, taskId);
  const casePath = assuranceCaseArtifactPath(targetPath, featureKey, taskId);
  const markdownPath = assuranceCaseMarkdownPath(targetPath, featureKey, taskId);
  const finalLoaded = await loadAssuranceInputs({ ...normalizedOptions, mode });
  if (!finalLoaded.ok) return finalLoaded;
  const finalNext = await runNextWorkflow({
    ...normalizedOptions,
    protocol: "3.1"
  });
  if (!finalNext.ok) return finalNext;
  if (!("actionId" in finalNext.value.action)) {
    return err(
      new VispError("VALIDATION_FAILED", "Assurance requires workflow action protocol 3.1.")
    );
  }
  if (
    assuranceInputIdentity({
      inputs: finalLoaded.value,
      actionId: finalNext.value.action.actionId
    }) !== initialInputIdentity
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Authoritative assurance inputs or workflow action changed before artifacts could be written; rerun assurance generation."
      )
    );
  }
  const finalSnapshot = await captureDiffSnapshot({
    targetPath,
    mode,
    baseRevision: plan.baseCommit.commit,
    targetRevision,
    commandRunner: options.commandRunner
  });
  if (!finalSnapshot.ok) return finalSnapshot;
  if (
    finalSnapshot.value.snapshotSha256 !== snapshot.value.snapshotSha256 ||
    finalSnapshot.value.state.stateSha256 !== snapshot.value.state.stateSha256
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Git state changed before assurance artifacts could be written; rerun assurance generation."
      )
    );
  }
  const written = await writeUpdatedGeneratedFiles(
    [
      {
        kind: "artifact",
        path: snapshotPath,
        displayPath: relativePath(targetPath, snapshotPath),
        artifactName: "diff snapshot",
        schema: diffSnapshotSchema,
        value: snapshot.value
      },
      {
        kind: "artifact",
        path: casePath,
        displayPath: relativePath(targetPath, casePath),
        artifactName: "assurance case",
        schema: assuranceCaseSchema,
        value: built.value
      },
      {
        kind: "text",
        path: markdownPath,
        displayPath: relativePath(targetPath, markdownPath),
        contents: renderAssuranceCase(built.value)
      }
    ],
    { dryRun: options.dryRun ?? false }
  );
  if (!written.ok) return written;
  return ok({
    success: true,
    taskId,
    mode,
    verdict: built.value.verdict,
    caseHash: built.value.caseHash,
    snapshotHash: snapshot.value.snapshotSha256,
    actions: written.value,
    dryRun: options.dryRun ?? false,
    nextCommand: built.value.nextAction.command
  });
}

export function formatAssuranceSummary(summary: AssuranceWorkflowSummary): string {
  return `${[
    formatHeader(summary.dryRun ? "Visp assurance dry run." : "Visp assurance generated."),
    "",
    formatKeyValue("Task", summary.taskId),
    formatKeyValue("Mode", summary.mode),
    formatKeyValue("Verdict", summary.verdict),
    formatKeyValue("Case", summary.caseHash),
    formatKeyValue("Snapshot", summary.snapshotHash),
    "",
    "Next:",
    `  ${summary.nextCommand}`
  ].join("\n")}\n`;
}
