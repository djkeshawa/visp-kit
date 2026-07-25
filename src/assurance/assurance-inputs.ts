import {
  baselineEvidenceArtifactPath,
  candidateEvidenceArtifactPath,
  diffSnapshotArtifactPath,
  oraclePlanArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  candidateEvidenceSchema,
  type CandidateEvidence
} from "../artifacts/schemas/candidate-evidence.schema.js";
import { type AssuranceCaseWithoutHash } from "../artifacts/schemas/assurance-case.schema.js";
import { type OverrideRecord } from "../artifacts/schemas/override.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  createCandidateWorkspaceFingerprint,
  createCommittedCandidateFingerprint
} from "../evidence/candidate-workspace.js";
import { validateCandidateEvidenceIntegrity } from "../evidence/candidate-evidence-validator.js";
import { createBaselineCacheKey } from "../evidence/baseline-cache-key.js";
import { hashOracleText, hashOracleValue } from "../oracle/oracle-authorization.js";
import { loadProjectState, type ProjectState } from "../orchestrator/project-state.js";
import { readOverrideStore } from "../overrides/override-store.js";
import { overrideExpired } from "../overrides/override-expiry.js";
import {
  loadOracleAuthorization,
  type LoadedOracleAuthorization
} from "../workflows/oracle-authorization.workflow.js";

type Binding = AssuranceCaseWithoutHash["bindings"][number];

export type AssuranceInputs = {
  readonly state: ProjectState & {
    readonly selectedFeature: NonNullable<ProjectState["selectedFeature"]>;
    readonly selectedTask: NonNullable<ProjectState["selectedTask"]>;
    readonly spec: NonNullable<ProjectState["spec"]>;
    readonly traceability: NonNullable<ProjectState["traceability"]>;
  };
  readonly authorization: LoadedOracleAuthorization;
  readonly candidate?: CandidateEvidence;
  readonly baselineIssue?: string;
  readonly candidateIssue?: string;
  readonly bindings: readonly Binding[];
  readonly overrides: readonly OverrideRecord[];
};

function requiredState(state: ProjectState): Result<AssuranceInputs["state"], VispError> {
  if (
    state.selectedFeature === undefined ||
    state.selectedTask === undefined ||
    state.spec === undefined ||
    state.traceability === undefined
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Assurance generation requires an active feature, task, specification, and traceability matrix."
      )
    );
  }
  return ok(state as AssuranceInputs["state"]);
}

function binding(id: string, role: Binding["role"], path: string, sha256: string): Binding {
  return { id, role, status: "available", path, sha256: sha256 as `sha256:${string}` };
}

function unavailableBinding(
  id: string,
  role: Binding["role"],
  path: string,
  reason: string
): Binding {
  return { id, role, status: "unavailable", path, reason };
}

export async function loadAssuranceInputs(options: {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId: string;
  readonly mode: "base_to_workspace" | "base_to_commit";
  readonly targetRevision?: string;
  readonly commandRunner?: CommandRunner;
  readonly now?: string;
}): Promise<Result<AssuranceInputs, VispError>> {
  const stateResult = await loadProjectState(options);
  if (!stateResult.ok) return stateResult;
  const state = requiredState(stateResult.value);
  if (!state.ok) return state;

  const authorization = await loadOracleAuthorization({
    ...options,
    allowMissingBaseline: true,
    allowStaleBaseline: true
  });
  if (!authorization.ok) return authorization;
  if (
    authorization.value.plan.taskId !== state.value.selectedTask.id ||
    authorization.value.plan.featureId !== state.value.selectedFeature.id ||
    authorization.value.plan.featureSlug !== state.value.selectedFeature.slug
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Locked oracle identity does not match the selected feature and task."
      )
    );
  }

  const targetPath = state.value.targetPath;
  const featureKey = state.value.selectedFeature.key;
  const taskId = state.value.selectedTask.id;
  const candidatePath = candidateEvidenceArtifactPath(targetPath, featureKey, taskId);
  let baselineIssue: string | undefined;
  if (authorization.value.baselineEvidence === undefined) {
    baselineIssue = "Baseline evidence artifact is missing.";
  } else {
    const currentBaselineKey = await createBaselineCacheKey({
      targetPath,
      plan: authorization.value.plan,
      planPath: authorization.value.planPath
    });
    if (!currentBaselineKey.ok) {
      baselineIssue = `Baseline evidence freshness is unknown: ${currentBaselineKey.error.message}`;
    } else if (
      currentBaselineKey.value.hash !== authorization.value.baselineEvidence.cacheKey.hash
    ) {
      baselineIssue = "Baseline evidence is stale for the current locked inputs.";
    }
  }
  const candidateExists = await pathExists(candidatePath);
  if (!candidateExists.ok) return candidateExists;
  let candidate: CandidateEvidence | undefined;
  let candidateFileSha256: `sha256:${string}` | undefined;
  let candidateIssue: string | undefined;
  if (!candidateExists.value) {
    candidateIssue = "Candidate evidence artifact is missing.";
  } else {
    const read = await readArtifact(candidatePath, candidateEvidenceSchema, {
      artifactName: "candidate evidence"
    });
    if (!read.ok) {
      candidateIssue = `Candidate evidence is invalid: ${read.error.message}`;
    } else if (
      authorization.value.baselineEvidence === undefined ||
      authorization.value.lock.baselineEvidence === undefined
    ) {
      candidateIssue = "Candidate evidence cannot be validated without locked baseline evidence.";
    } else {
      const workspace =
        options.mode === "base_to_commit"
          ? authorization.value.plan.baseCommit.status !== "captured" ||
            options.targetRevision === undefined
            ? err(
                new VispError(
                  "VALIDATION_FAILED",
                  "Committed assurance requires captured base and target revisions."
                )
              )
            : await createCommittedCandidateFingerprint({
                targetPath,
                baseRevision: authorization.value.plan.baseCommit.commit,
                targetRevision: options.targetRevision,
                commandRunner: options.commandRunner
              })
          : await createCandidateWorkspaceFingerprint({
              targetPath,
              task: state.value.selectedTask,
              commandRunner: options.commandRunner
            });
      if (!workspace.ok) {
        candidateIssue = `Candidate workspace freshness is unknown: ${workspace.error.message}`;
      } else {
        const validated = validateCandidateEvidenceIntegrity({
          evidence: read.value,
          plan: authorization.value.plan,
          planPath: authorization.value.planPath,
          authorization: authorization.value.binding,
          baselineBinding: authorization.value.lock.baselineEvidence,
          baselineCacheKeySha256: authorization.value.baselineEvidence.cacheKey.hash,
          currentWorkspace: workspace.value
        });
        if (validated.ok) {
          candidate = validated.value;
          const rawCandidate = await readTextFile(candidatePath);
          if (!rawCandidate.ok) return rawCandidate;
          candidateFileSha256 = hashOracleText(rawCandidate.value);
        } else {
          candidateIssue = validated.error.message;
        }
      }
    }
  }

  const baselinePath = baselineEvidenceArtifactPath(targetPath, featureKey, taskId);
  const taskGraphPath = relativePath(targetPath, taskGraphArtifactPath(targetPath, featureKey));
  const plan = authorization.value.plan;
  const bindings: Binding[] = [
    binding("BIND-policy", "policy", plan.bindings.policy.path, plan.bindings.policy.sha256),
    binding(
      "BIND-specification",
      "specification",
      plan.bindings.specification.path,
      plan.bindings.specification.sha256
    ),
    binding("BIND-plan", "plan", plan.bindings.plan.path, plan.bindings.plan.sha256),
    binding(
      "BIND-task-graph",
      "task_graph",
      plan.bindings.taskGraph.path,
      plan.bindings.taskGraph.sha256
    ),
    binding("BIND-context", "context", plan.bindings.context.path, plan.bindings.context.sha256),
    binding("BIND-task", "task", taskGraphPath, plan.bindings.task.sha256),
    binding(
      "BIND-oracle-plan",
      "oracle_plan",
      relativePath(targetPath, oraclePlanArtifactPath(targetPath, featureKey, taskId)),
      hashOracleValue(plan)
    ),
    binding(
      "BIND-oracle-lock",
      "oracle_lock",
      authorization.value.binding.lockPath,
      authorization.value.binding.lockFileSha256
    ),
    authorization.value.lock.baselineEvidence === undefined
      ? unavailableBinding(
          "BIND-baseline-evidence",
          "baseline_evidence",
          relativePath(targetPath, baselinePath),
          baselineIssue ?? "Baseline evidence is unavailable."
        )
      : binding(
          "BIND-baseline-evidence",
          "baseline_evidence",
          relativePath(targetPath, baselinePath),
          authorization.value.lock.baselineEvidence.sha256
        ),
    candidate === undefined
      ? unavailableBinding(
          "BIND-candidate-evidence",
          "candidate_evidence",
          relativePath(targetPath, candidatePath),
          candidateIssue ?? "Candidate evidence is unavailable."
        )
      : binding(
          "BIND-candidate-evidence",
          "candidate_evidence",
          relativePath(targetPath, candidatePath),
          candidateFileSha256 ?? hashOracleValue(candidate)
        ),
    binding(
      "BIND-diff-snapshot",
      "diff_snapshot",
      relativePath(targetPath, diffSnapshotArtifactPath(targetPath, featureKey, taskId)),
      hashOracleValue({ state: "pending" })
    )
  ];

  const overrideStore = await readOverrideStore(targetPath);
  if (!overrideStore.ok) return overrideStore;
  const now = options.now ?? new Date().toISOString();
  const overrides = overrideStore.value.artifact.overrides.filter(
    (override) =>
      override.status === "active" &&
      !overrideExpired({ expiresAt: override.expiresAt, now }) &&
      (override.scope === "project" ||
        ((override.featureId === undefined ||
          override.featureId === null ||
          override.featureId === state.value.selectedFeature.id) &&
          (override.featureSlug === undefined ||
            override.featureSlug === null ||
            override.featureSlug === state.value.selectedFeature.slug) &&
          (override.scope === "feature" ||
            ((override.taskId === undefined ||
              override.taskId === null ||
              override.taskId === state.value.selectedTask.id) &&
              (override.scope === "task" ||
                (override.scope === "stage" && override.stage === "review"))))))
  );

  return ok({
    state: state.value,
    authorization: authorization.value,
    candidate,
    baselineIssue,
    candidateIssue,
    bindings,
    overrides
  });
}
