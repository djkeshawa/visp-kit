import { createHash } from "node:crypto";
import { lstat } from "node:fs/promises";
import path from "node:path";

import {
  contextPackArtifactPath,
  oraclePlanArtifactPath,
  planArtifactPath,
  policyArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import {
  oraclePlanSchema,
  type OraclePlan,
  type OracleTestStrengthEvidence
} from "../artifacts/schemas/oracle-plan.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import { policyArtifactSchema } from "../artifacts/schemas/policy.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { selectTaskById } from "../context/task-selector.js";
import {
  generateOraclePlan,
  validateOraclePlan,
  type OracleBaseCommit,
  type OraclePlanGenerationInput
} from "../oracle/oracle-plan.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import { writeGeneratedFiles, type WorkflowFileAction } from "./shared/generated-files.js";
import { loadTaskGraph } from "./shared/task-graph-loader.js";
import { artifactGeneratedFile } from "./shared/template-workflow.js";

export type OracleWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly preApprovedTests?: readonly string[];
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

export type OracleWorkflowSummary = {
  readonly success: boolean;
  readonly feature: { readonly id: string; readonly slug: string };
  readonly taskId: string;
  readonly assuranceProfile: OraclePlan["assuranceProfile"];
  readonly oracleCount: number;
  readonly testStrengthEvidenceCount: number;
  readonly planPath: string;
  readonly action: WorkflowFileAction["action"] | "validated";
  readonly dryRun: boolean;
  readonly nextCommand: string;
};

function requiredTaskId(taskId: string | undefined): Result<string, VispError> {
  if (taskId === undefined || taskId.trim().length === 0) {
    return err(new VispError("VALIDATION_FAILED", "Oracle commands require --task <task-id>."));
  }
  return ok(taskId.trim());
}

function sha256Text(contents: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

function projectRelativePath(targetPath: string, suppliedPath: string): Result<string, VispError> {
  const normalized = suppliedPath.replaceAll("\\", "/").replace(/^\.\/+/u, "");
  const absolute = path.resolve(targetPath, normalized);
  const relative = path.relative(targetPath, absolute).replaceAll("\\", "/");

  if (
    normalized.length === 0 ||
    path.isAbsolute(suppliedPath) ||
    relative === ".." ||
    relative.startsWith("../")
  ) {
    return err(
      new VispError("VALIDATION_FAILED", `Test path must stay inside the project: ${suppliedPath}.`)
    );
  }

  return ok(relative);
}

function isTestPath(filePath: string): boolean {
  const normalized = filePath.replaceAll("\\", "/").toLowerCase();
  return (
    /(^|\/)(__tests__|tests?)(\/|$)/u.test(normalized) || /\.(spec|test)\.[^/]+$/u.test(normalized)
  );
}

async function captureBaseCommit(
  targetPath: string,
  runner: CommandRunner
): Promise<OracleBaseCommit> {
  const result = await runner.run("git", ["rev-parse", "HEAD"], { cwd: targetPath });
  const commit = result.ok ? result.value.stdout.trim() : "";

  return /^[a-f0-9]{40,64}$/u.test(commit)
    ? { status: "captured", commit }
    : { status: "unavailable", reason: "Git base commit is unavailable." };
}

async function currentFileHash(
  targetPath: string,
  filePath: string
): Promise<Result<`sha256:${string}`, VispError>> {
  const absolutePath = path.join(targetPath, filePath);
  try {
    const info = await lstat(absolutePath);
    if (!info.isFile() || info.isSymbolicLink()) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Test-strength evidence must be a regular project file: ${filePath}.`
        )
      );
    }
  } catch (error) {
    return err(
      new VispError("VALIDATION_FAILED", `Unable to inspect test-strength file ${filePath}.`, {
        cause: error
      })
    );
  }

  const text = await readTextFile(absolutePath);
  if (!text.ok) {
    return err(
      new VispError("VALIDATION_FAILED", `Unable to read test-strength file ${filePath}.`, {
        cause: text.error
      })
    );
  }
  return ok(sha256Text(text.value));
}

function baseCommitMatches(current: OracleBaseCommit, planned: OracleBaseCommit): boolean {
  if (current.status !== planned.status) return false;
  if (current.status === "unavailable") return true;
  return planned.status === "captured" && current.commit === planned.commit;
}

async function preExistingEvidence(input: {
  readonly targetPath: string;
  readonly path: string;
  readonly baseCommit: OracleBaseCommit;
  readonly runner: CommandRunner;
}): Promise<OracleTestStrengthEvidence | undefined> {
  if (input.baseCommit.status !== "captured") return undefined;
  const current = await currentFileHash(input.targetPath, input.path);
  if (!current.ok) return undefined;

  const committed = await input.runner.run(
    "git",
    ["show", `${input.baseCommit.commit}:${input.path}`],
    { cwd: input.targetPath }
  );
  if (!committed.ok || sha256Text(committed.value.stdout) !== current.value) return undefined;

  return {
    path: input.path,
    sha256: current.value,
    independence: "pre_existing",
    source: { kind: "git_base_commit", commit: input.baseCommit.commit }
  };
}

async function collectTestEvidence(input: {
  readonly targetPath: string;
  readonly graph: TaskGraphArtifact;
  readonly taskId: string;
  readonly contextPaths: readonly string[];
  readonly explicitPaths: readonly string[];
  readonly baseCommit: OracleBaseCommit;
  readonly runner: CommandRunner;
}): Promise<Result<readonly OracleTestStrengthEvidence[], VispError>> {
  const selected = selectTaskById(input.graph, input.taskId);
  if (!selected.ok) return selected;

  const explicit = new Set<string>();
  const evidence: OracleTestStrengthEvidence[] = [];

  for (const suppliedPath of input.explicitPaths) {
    const normalized = projectRelativePath(input.targetPath, suppliedPath);
    if (!normalized.ok) return normalized;
    if (explicit.has(normalized.value)) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Pre-approved test path is duplicated: ${normalized.value}.`
        )
      );
    }
    if (!isTestPath(normalized.value)) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Pre-approved test-strength evidence must be a test path: ${normalized.value}.`
        )
      );
    }
    const hash = await currentFileHash(input.targetPath, normalized.value);
    if (!hash.ok) return hash;
    evidence.push({
      path: normalized.value,
      sha256: hash.value,
      independence: "pre_approved",
      source: {
        kind: "explicit_pre_approval",
        reference: `visp-kit oracle plan --pre-approved-test ${normalized.value}`
      }
    });
    explicit.add(normalized.value);
  }

  // A regression_test task's own declared test files are its deliverable, not
  // independent evidence. Classify them before the generic scan so the workflow
  // does not deadlock on the task changing the very file it exists to write.
  const deliverableTests =
    selected.value.taskClass === "regression_test"
      ? (selected.value.expectedFiles ?? [])
          .filter(isTestPath)
          .map((candidate) => candidate.replaceAll("\\", "/").replace(/^\.\/+/u, ""))
          .filter((candidate) => !explicit.has(candidate))
      : [];

  for (const candidate of [...new Set(deliverableTests)].sort()) {
    const normalized = projectRelativePath(input.targetPath, candidate);
    if (!normalized.ok) return normalized;
    const hash = await currentFileHash(input.targetPath, normalized.value);
    if (!hash.ok) return hash;
    evidence.push({
      path: normalized.value,
      sha256: hash.value,
      independence: "task_deliverable",
      source: {
        kind: "declared_task_deliverable",
        taskId: selected.value.id,
        taskClass: "regression_test"
      }
    });
    explicit.add(normalized.value);
  }

  const candidates = [
    ...selected.value.allowedFiles,
    ...(selected.value.expectedFiles ?? []),
    ...input.contextPaths
  ]
    .filter(isTestPath)
    .map((candidate) => candidate.replaceAll("\\", "/").replace(/^\.\/+/u, ""))
    .filter((candidate) => !explicit.has(candidate));

  for (const candidate of [...new Set(candidates)].sort()) {
    const normalized = projectRelativePath(input.targetPath, candidate);
    if (!normalized.ok) return normalized;
    const existing = await preExistingEvidence({
      targetPath: input.targetPath,
      path: normalized.value,
      baseCommit: input.baseCommit,
      runner: input.runner
    });
    if (existing !== undefined) evidence.push(existing);
  }

  return ok(evidence.sort((left, right) => left.path.localeCompare(right.path)));
}

async function validateEvidenceFiles(input: {
  readonly targetPath: string;
  readonly plan: OraclePlan;
  readonly runner: CommandRunner;
}): Promise<Result<void, VispError>> {
  for (const evidence of input.plan.testStrengthEvidence) {
    // The task declared this test as its own deliverable, so a change to it is
    // expected rather than tampering. The plan-time hash stays recorded for
    // audit, and the assurance case raises a mandatory hotspot for review.
    if (evidence.independence === "task_deliverable") continue;

    const normalized = projectRelativePath(input.targetPath, evidence.path);
    if (!normalized.ok) return normalized;
    const current = await currentFileHash(input.targetPath, normalized.value);
    if (!current.ok) return current;
    if (current.value !== evidence.sha256) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Test-strength evidence changed: ${evidence.path}. ` +
            "The locked oracle pins this file by hash, so a change to it invalidates " +
            "the lock. If the change was accidental, restore the file. If authoring " +
            "this test is the task's declared deliverable, re-plan with " +
            `\`visp-kit oracle plan --task <id> --pre-approved-test ${evidence.path} --force\`, ` +
            "which records the file as explicitly pre-approved, then lock again."
        )
      );
    }
    if (evidence.independence === "pre_existing") {
      const committed = await input.runner.run(
        "git",
        ["show", `${evidence.source.commit}:${evidence.path}`],
        { cwd: input.targetPath }
      );
      if (!committed.ok || sha256Text(committed.value.stdout) !== evidence.sha256) {
        return err(
          new VispError(
            "VALIDATION_FAILED",
            `Pre-existing test evidence is not present at its base commit: ${evidence.path}.`
          )
        );
      }
    }
  }
  return ok(undefined);
}

async function loadGenerationInput(input: {
  readonly options: OracleWorkflowOptions;
  readonly existingPlan?: OraclePlan;
}): Promise<
  Result<
    {
      readonly generation: OraclePlanGenerationInput;
      readonly targetPath: string;
      readonly featureKey: string;
    },
    VispError
  >
> {
  const targetPath = path.resolve(
    input.options.cwd ?? process.cwd(),
    input.options.targetPath ?? "."
  );
  const taskId = requiredTaskId(input.options.taskId);
  if (!taskId.ok) return taskId;
  const feature = await resolveActiveFeature({ targetPath, feature: input.options.feature });
  if (!feature.ok) return feature;

  const graph = await loadTaskGraph({ targetPath, featureKey: feature.value.key });
  if (!graph.ok) return graph;
  const task = selectTaskById(graph.value, taskId.value);
  if (!task.ok) return task;

  const specificationPath = specArtifactPath(targetPath, feature.value.key);
  const planningPath = planArtifactPath(targetPath, feature.value.key);
  const policyPath = policyArtifactPath(targetPath);
  const graphPath = taskGraphArtifactPath(targetPath, feature.value.key);
  const contextPath = contextPackArtifactPath(targetPath, feature.value.key, taskId.value);
  const specification = await readArtifact(specificationPath, specArtifactSchema, {
    artifactName: "specification"
  });
  if (!specification.ok) return specification;
  const plan = await readArtifact(planningPath, planDraftArtifactSchema, {
    artifactName: "plan"
  });
  if (!plan.ok) return plan;
  const policy = await readArtifact(policyPath, policyArtifactSchema, {
    artifactName: "policy"
  });
  if (!policy.ok) return policy;
  const context = await readArtifact(contextPath, contextPackSchema, {
    artifactName: "context pack"
  });
  if (!context.ok) return context;

  const runner = input.options.commandRunner ?? defaultCommandRunner;
  const baseCommit =
    input.existingPlan?.baseCommit ?? (await captureBaseCommit(targetPath, runner));
  let resolvedEvidence: readonly OracleTestStrengthEvidence[];
  if (input.existingPlan !== undefined) {
    resolvedEvidence = input.existingPlan.testStrengthEvidence;
  } else {
    const evidence = await collectTestEvidence({
      targetPath,
      graph: graph.value,
      taskId: taskId.value,
      contextPaths: context.value.includedFiles.map((file) => file.path),
      explicitPaths: input.options.preApprovedTests ?? [],
      baseCommit,
      runner
    });
    if (!evidence.ok) return evidence;
    resolvedEvidence = evidence.value;
  }

  return ok({
    targetPath,
    featureKey: feature.value.key,
    generation: {
      featureId: feature.value.id,
      featureSlug: feature.value.slug,
      task: task.value,
      specification: {
        path: relativePath(targetPath, specificationPath),
        value: specification.value
      },
      plan: { path: relativePath(targetPath, planningPath), value: plan.value },
      policy: { path: relativePath(targetPath, policyPath), value: policy.value },
      taskGraph: { path: relativePath(targetPath, graphPath), value: graph.value },
      context: { path: relativePath(targetPath, contextPath), value: context.value },
      baseCommit,
      testStrengthEvidence: resolvedEvidence,
      generatedAt: input.existingPlan?.generatedAt ?? input.options.now ?? new Date().toISOString()
    }
  });
}

function summary(input: {
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly action: OracleWorkflowSummary["action"];
  readonly dryRun: boolean;
}): OracleWorkflowSummary {
  return {
    success: true,
    feature: { id: input.plan.featureId, slug: input.plan.featureSlug },
    taskId: input.plan.taskId,
    assuranceProfile: input.plan.assuranceProfile,
    oracleCount: input.plan.oracles.length,
    testStrengthEvidenceCount: input.plan.testStrengthEvidence.length,
    planPath: input.planPath,
    action: input.action,
    dryRun: input.dryRun,
    nextCommand: `visp-kit oracle validate --task ${input.plan.taskId}`
  };
}

export async function runOraclePlanWorkflow(
  options: OracleWorkflowOptions = {}
): Promise<Result<OracleWorkflowSummary, VispError>> {
  const loaded = await loadGenerationInput({ options });
  if (!loaded.ok) return loaded;
  const generated = generateOraclePlan(loaded.value.generation);
  if (!generated.ok) return generated;
  const artifactPath = oraclePlanArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    generated.value.taskId
  );
  const written = await writeGeneratedFiles(
    [
      artifactGeneratedFile({
        targetPath: loaded.value.targetPath,
        path: artifactPath,
        artifactName: "oracle plan",
        schema: oraclePlanSchema,
        value: generated.value
      })
    ],
    { force: options.force ?? false, dryRun: options.dryRun ?? false }
  );
  if (!written.ok) return written;

  return ok(
    summary({
      plan: generated.value,
      planPath: relativePath(loaded.value.targetPath, artifactPath),
      action: written.value[0]?.action ?? "created",
      dryRun: options.dryRun ?? false
    })
  );
}

export async function runOracleValidateWorkflow(
  options: OracleWorkflowOptions = {}
): Promise<Result<OracleWorkflowSummary, VispError>> {
  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const taskId = requiredTaskId(options.taskId);
  if (!taskId.ok) return taskId;
  const feature = await resolveActiveFeature({ targetPath, feature: options.feature });
  if (!feature.ok) return feature;
  const artifactPath = oraclePlanArtifactPath(targetPath, feature.value.key, taskId.value);
  const exists = await pathExists(artifactPath);
  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Oracle plan is missing for ${taskId.value}. Run \`visp-kit oracle plan --task ${taskId.value}\`.`
      )
    );
  }
  const plan = await readArtifact(artifactPath, oraclePlanSchema, { artifactName: "oracle plan" });
  if (!plan.ok) return plan;
  const runner = options.commandRunner ?? defaultCommandRunner;
  const currentBaseCommit = await captureBaseCommit(targetPath, runner);
  if (!baseCommitMatches(currentBaseCommit, plan.value.baseCommit)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Oracle plan base commit is stale for task ${taskId.value}.`
      )
    );
  }
  const files = await validateEvidenceFiles({ targetPath, plan: plan.value, runner });
  if (!files.ok) return files;
  const loaded = await loadGenerationInput({ options, existingPlan: plan.value });
  if (!loaded.ok) return loaded;
  const validated = validateOraclePlan(plan.value, loaded.value.generation);
  if (!validated.ok) return validated;

  return ok(
    summary({
      plan: validated.value,
      planPath: relativePath(targetPath, artifactPath),
      action: "validated",
      dryRun: false
    })
  );
}

export function formatOracleSummary(value: OracleWorkflowSummary): string {
  return `${[
    formatHeader(
      value.action === "validated" ? "Visp oracle plan valid" : "Visp oracle plan ready"
    ),
    "",
    formatKeyValue("Feature", `${value.feature.id}-${value.feature.slug}`),
    formatKeyValue("Task", value.taskId),
    formatKeyValue("Assurance", value.assuranceProfile),
    formatKeyValue("Oracles", String(value.oracleCount)),
    formatKeyValue("Test-strength evidence", String(value.testStrengthEvidenceCount)),
    formatKeyValue("Artifact", value.planPath),
    formatKeyValue("Action", value.action),
    "",
    "Next:",
    `  ${value.nextCommand}`
  ].join("\n")}\n`;
}
