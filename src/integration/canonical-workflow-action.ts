import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type AppliedPolicyOverride, type PolicyStatus } from "../artifacts/schemas/gate.schema.js";
import {
  type RequirementPriority,
  type RiskLevel,
  type ValidationMethod
} from "../artifacts/schemas/common.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import {
  canonicalJsonV1,
  compareUtf16CodeUnits,
  createWorkflowActionId,
  type Sha256Hash
} from "./canonical-json.js";

export type DeclaredUnavailableReason =
  | "not_in_source_artifact"
  | "not_in_protocol"
  | "source_missing"
  | "source_invalid"
  | "not_captured"
  | "unsupported";

export type DeclaredNotApplicableReason =
  | "no_active_feature"
  | "no_active_task"
  | "stage_does_not_require_value";

export type DeclaredValue<T> =
  | { readonly state: "available"; readonly value: T }
  | { readonly state: "unavailable"; readonly reasonCode: DeclaredUnavailableReason }
  | { readonly state: "not_applicable"; readonly reasonCode: DeclaredNotApplicableReason };

export type CanonicalWorkflowPhase =
  | "next"
  | "setup"
  | "feature"
  | "clarify"
  | "spec"
  | "plan"
  | "tasks"
  | "context"
  | "implement"
  | "verify"
  | "review"
  | "reconcile"
  | "pr";

export type TaskClass =
  | "localized_bug"
  | "bounded_feature"
  | "cross_file_change"
  | "regression_test"
  | "refactor"
  | "migration"
  | "security"
  | "documentation";

export type RiskFactorCode =
  | "authentication"
  | "authorization"
  | "cryptography"
  | "public_api"
  | "schema"
  | "dependency"
  | "concurrency"
  | "permissions"
  | "deployment"
  | "data_migration";

export type RiskFactor = {
  readonly version: "1.0";
  readonly code: RiskFactorCode;
};

export type AssuranceProfile = "routine" | "behavioral" | "critical";

export type OperationLimits = {
  readonly version: "1.0";
  readonly maxChangedFiles: number;
  readonly dependencyChangesAllowed: boolean;
};

export type EvidenceRequirement = {
  readonly version: "1.0";
  readonly id: string;
  readonly providerId: string;
  readonly target:
    | { readonly kind: "command"; readonly command: string }
    | { readonly kind: "validation_oracle"; readonly oracleId: string }
    | { readonly kind: "static_check"; readonly checkId: string }
    | { readonly kind: "security_check"; readonly checkId: string }
    | { readonly kind: "human_review"; readonly reviewId: string };
  readonly freshnessRule: string;
  readonly independenceRule: string;
  readonly requiredVerdict: "passed";
};

export type HashedReadRole =
  | "policy"
  | "intent"
  | "specification"
  | "plan"
  | "task_graph"
  | "context_pack"
  | "implementation_prompt"
  | "oracle_plan";

export type HashedRead = {
  readonly id: string;
  readonly role: HashedReadRole;
  readonly path: string;
  readonly contentHash: Sha256Hash;
  readonly freshness: "content_hash";
};

export type RequirementClaim = {
  readonly id: string;
  readonly statement: string;
  readonly priority: RequirementPriority;
  readonly acceptanceCriterionIds: readonly string[];
  readonly accountableOwner: DeclaredValue<string>;
};

export type ValidationOracle = {
  readonly id: string;
  readonly claimId: string;
  readonly statement: string;
  readonly testable: boolean;
  readonly validationMethod: ValidationMethod;
};

export type Finding = {
  readonly code: string;
  readonly source: "policy" | "workflow" | "contract" | "freshness";
  readonly severity: "info" | "warning" | "error";
  readonly effect: "none" | "blocks" | "uncertain";
  readonly message: string;
  readonly recommendation: string;
  readonly evidence: readonly string[];
};

export type ActionVerdict = "ready" | "blocked" | "inconclusive";

export type CanonicalWorkflowActionIdentityInput = {
  readonly canonicalVersion: "1.0";
  readonly phase: CanonicalWorkflowPhase;
  readonly feature: { readonly id: string; readonly slug: string } | null;
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly status: Task["status"];
    readonly dependsOn: readonly string[];
    readonly parallelizable: boolean;
  } | null;
  readonly taskClass: DeclaredValue<TaskClass>;
  readonly risk: {
    readonly level: DeclaredValue<RiskLevel>;
    readonly factors: DeclaredValue<readonly RiskFactor[]>;
  };
  readonly assurance: {
    readonly level: "kit_strict" | "advisory";
    readonly profile: DeclaredValue<AssuranceProfile>;
    readonly workflowStrictness: DeclaredValue<StrictnessMode>;
  };
  readonly goal: string;
  readonly baseCommit: DeclaredValue<string>;
  readonly requiredReads: readonly HashedRead[];
  readonly scope: {
    readonly writablePaths: readonly string[];
    readonly expectedPaths: DeclaredValue<readonly string[]>;
    readonly forbiddenPaths: readonly string[];
    readonly operationLimits: DeclaredValue<OperationLimits>;
  };
  readonly claims: DeclaredValue<readonly RequirementClaim[]>;
  readonly validationOracles: readonly ValidationOracle[];
  readonly validationCommands: readonly string[];
  readonly requiredEvidence: DeclaredValue<readonly EvidenceRequirement[]>;
  readonly policy: {
    readonly status: DeclaredValue<PolicyStatus>;
    readonly appliedOverrides: DeclaredValue<readonly AppliedPolicyOverride[]>;
  };
  readonly findings: readonly Finding[];
  readonly verdict: ActionVerdict;
  readonly nextCommand: string;
};

export type CanonicalWorkflowAction = CanonicalWorkflowActionIdentityInput & {
  readonly actionId: Sha256Hash;
};

export type CanonicalWorkflowActionV2Presentation = {
  readonly writablePaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly oracleOrder: readonly string[];
  readonly findingOrder: readonly Sha256Hash[];
};

export type CanonicalWorkflowActionEnvelope = {
  readonly action: CanonicalWorkflowAction;
  readonly v2Presentation: CanonicalWorkflowActionV2Presentation;
};

type AddFinding = (finding: Finding, invalidatesDecision?: boolean) => void;

type ReadCandidate = {
  readonly id: string;
  readonly role: HashedReadRole;
  readonly path: string;
};

const readRoleOrder: Record<HashedReadRole, number> = {
  policy: 0,
  intent: 1,
  specification: 2,
  plan: 3,
  task_graph: 4,
  context_pack: 5,
  implementation_prompt: 6,
  oracle_plan: 7
};

const strictnessModes = new Set<StrictnessMode>(["relaxed", "standard", "strict", "locked"]);

function unavailable<T>(reasonCode: DeclaredUnavailableReason): DeclaredValue<T> {
  return { state: "unavailable", reasonCode };
}

function notApplicable<T>(reasonCode: DeclaredNotApplicableReason): DeclaredValue<T> {
  return { state: "not_applicable", reasonCode };
}

function available<T>(value: T): DeclaredValue<T> {
  return { state: "available", value };
}

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareUtf16CodeUnits);
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort(compareUtf16CodeUnits);
}

function normalizeEvidence(evidence: readonly string[]): string[] {
  return sortUnique(evidence);
}

function findingComparator(left: Finding, right: Finding): number {
  const fields: Array<[string, string]> = [
    [left.code, right.code],
    [left.source, right.source],
    [left.severity, right.severity],
    [left.effect, right.effect],
    [left.message, right.message],
    [left.recommendation, right.recommendation],
    [left.evidence.join("\0"), right.evidence.join("\0")]
  ];

  for (const [leftValue, rightValue] of fields) {
    const comparison = compareUtf16CodeUnits(leftValue, rightValue);
    if (comparison !== 0) return comparison;
  }
  return 0;
}

function normalizedFindings(findings: readonly Finding[]): Finding[] {
  const unique = new Map<string, Finding>();

  for (const finding of findings) {
    const normalized = { ...finding, evidence: normalizeEvidence(finding.evidence) };
    unique.set(canonicalJsonV1(normalized), normalized);
  }

  return [...unique.values()].sort(findingComparator);
}

export function canonicalFindingReference(finding: Finding): Sha256Hash {
  const normalized = { ...finding, evidence: normalizeEvidence(finding.evidence) };
  return `sha256:${createHash("sha256").update(canonicalJsonV1(normalized)).digest("hex")}`;
}

function invalidPathFinding(input: string): Finding {
  return {
    code: "VISP.CONTRACT.INVALID_PROJECT_PATH",
    source: "contract",
    severity: "error",
    effect: "uncertain",
    message: `Project path is not a safe relative path: ${JSON.stringify(input)}.`,
    recommendation: "Use a project-relative path without absolute or traversal segments.",
    evidence: [input]
  };
}

function normalizeProjectPath(input: string, addFinding: AddFinding): string | undefined {
  const normalized = input.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const unsafe =
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..");

  if (unsafe) {
    addFinding(invalidPathFinding(input), true);
    return undefined;
  }

  const compact = segments.filter((segment) => segment.length > 0).join("/");
  if (compact.length === 0) {
    addFinding(invalidPathFinding(input), true);
    return undefined;
  }

  return compact;
}

function normalizePathSetWithPresentation(
  paths: readonly string[],
  addFinding: AddFinding
): { readonly values: string[]; readonly presentation: string[] } {
  const normalized: string[] = [];
  const presentation: string[] = [];
  for (const input of paths) {
    const result = normalizeProjectPath(input, addFinding);
    if (result === undefined) continue;
    normalized.push(result);
    presentation.push(input);
  }
  return { values: sortUnique(normalized), presentation };
}

function phaseFromState(state: string): CanonicalWorkflowPhase {
  if (["not-initialized", "scan-needed", "constitution-needed"].includes(state)) {
    return "setup";
  }
  if (state === "feature-needed") return "feature";
  if (state.startsWith("clarify-")) return "clarify";
  if (state.startsWith("spec-")) return "spec";
  if (state.startsWith("plan-")) return "plan";
  if (state.startsWith("tasks-") || state === "task-missing") return "tasks";
  if (
    state.startsWith("context-") ||
    state.startsWith("next-task-") ||
    state.startsWith("checklist-")
  ) {
    return "context";
  }
  if (state.startsWith("implementation-")) return "implement";
  if (state.startsWith("verify-") || state.startsWith("verification-")) return "verify";
  if (state.startsWith("review-")) return "review";
  if (state.startsWith("reconcile-") || state.startsWith("traceability-update-")) {
    return "reconcile";
  }
  if (state.startsWith("pr-") || state === "ready-for-pr") return "pr";
  return "next";
}

function taskIdentityMatches(
  task: Task | undefined,
  stepTask: NonNullable<NextStep["task"]>
): boolean {
  return (
    task !== undefined &&
    task.id === stepTask.id &&
    task.title === stepTask.title &&
    task.status === stepTask.status
  );
}

function isExactNextTaskTransition(state: ProjectState, step: NextStep): boolean {
  const selectedTask = state.selectedTask;
  const stepTask = step.task;
  if (
    step.state !== "next-task-needed" ||
    selectedTask === undefined ||
    stepTask === null ||
    (selectedTask.status !== "done" && selectedTask.status !== "verified")
  ) {
    return false;
  }

  const graphTasks = state.taskGraph?.tasks ?? [];
  const nextTask = graphTasks.find((task) => task.status !== "done" && task.status !== "verified");
  const matchingTasks = graphTasks.filter((task) => task.id === stepTask.id);

  return (
    nextTask !== undefined &&
    nextTask.id !== selectedTask.id &&
    nextTask.id === stepTask.id &&
    matchingTasks.length === 1 &&
    nextTask.title === stepTask.title &&
    nextTask.status === stepTask.status
  );
}

function stableTaskSource(task: Task): object {
  const normalizedPaths = (values: readonly string[] | undefined): readonly string[] | null =>
    values === undefined ? null : sortUnique(values.map((value) => value.replaceAll("\\", "/")));

  return {
    id: task.id,
    title: task.title,
    description: task.description,
    requirementIds: sortUnique(task.requirementIds),
    acceptanceCriterionIds: sortUnique(task.acceptanceCriterionIds),
    dependsOn: sortUnique(task.dependsOn),
    allowedFiles: normalizedPaths(task.allowedFiles),
    expectedFiles: normalizedPaths(task.expectedFiles),
    forbiddenFiles: normalizedPaths(task.forbiddenFiles),
    validationCommands: [...task.validationCommands],
    parallelizable: task.parallelizable,
    riskLevel: task.riskLevel
  };
}

function strictnessContext(
  strictness: string | undefined,
  addFinding: AddFinding
): {
  readonly level: "kit_strict" | "advisory";
  readonly workflowStrictness: DeclaredValue<StrictnessMode>;
} {
  if (strictness === undefined) {
    return { level: "advisory", workflowStrictness: unavailable("not_captured") };
  }
  if (!strictnessModes.has(strictness as StrictnessMode)) {
    addFinding(
      {
        code: "VISP.CONTRACT.STRICTNESS_INVALID",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: `Workflow strictness is unsupported: ${JSON.stringify(strictness)}.`,
        recommendation: "Re-evaluate the action with a valid Kit strictness mode.",
        evidence: [strictness]
      },
      true
    );
    return { level: "advisory", workflowStrictness: unavailable("source_invalid") };
  }

  const value = strictness as StrictnessMode;
  return {
    level: value === "strict" || value === "locked" ? "kit_strict" : "advisory",
    workflowStrictness: available(value)
  };
}

function identityFindings(state: ProjectState, step: NextStep, addFinding: AddFinding): void {
  if (path.resolve(state.targetPath) !== path.resolve(step.targetPath)) {
    addFinding(
      {
        code: "VISP.CONTRACT.TARGET_PATH_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step target paths disagree.",
        recommendation: "Reload project state and recompute the next action for one project root.",
        evidence: ["target-paths-differ"]
      },
      true
    );
  }

  const feature = state.selectedFeature;
  if (
    step.feature !== null &&
    (feature === undefined || step.feature.id !== feature.id || step.feature.slug !== feature.slug)
  ) {
    addFinding(
      {
        code: "VISP.CONTRACT.FEATURE_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step feature identity disagree.",
        recommendation: "Reload project state and recompute the next action.",
        evidence: [feature?.id ?? "null", step.feature.id]
      },
      true
    );
  }

  const task = state.selectedTask;
  if (
    step.task !== null &&
    !taskIdentityMatches(task, step.task) &&
    !isExactNextTaskTransition(state, step)
  ) {
    addFinding(
      {
        code: "VISP.CONTRACT.TASK_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Project state and next-step task identity disagree.",
        recommendation: "Reload project state and recompute the next action.",
        evidence: [task?.id ?? "null", step.task.id]
      },
      true
    );
  }
}

function sourceIdentityFindings(state: ProjectState, addFinding: AddFinding): void {
  const feature = state.selectedFeature;
  const task = state.selectedTask;
  const mismatches: string[] = [];

  if (feature !== undefined && feature.intent !== undefined) {
    if (feature.intent.id !== feature.id) mismatches.push(`intent:${feature.intent.id}`);
    if (feature.intent.slug !== feature.slug) mismatches.push(`intent:${feature.intent.slug}`);
  }

  if (feature !== undefined && state.spec !== undefined) {
    if (state.spec.featureId !== feature.id) mismatches.push(`spec:${state.spec.featureId}`);
    if (state.spec.featureSlug !== feature.slug) mismatches.push(`spec:${state.spec.featureSlug}`);
  }
  if (feature !== undefined && state.taskGraph !== undefined) {
    if (state.taskGraph.featureId !== feature.id) {
      mismatches.push(`task-graph:${state.taskGraph.featureId}`);
    }
    if (state.taskGraph.featureSlug !== undefined && state.taskGraph.featureSlug !== feature.slug) {
      mismatches.push(`task-graph:${state.taskGraph.featureSlug}`);
    }
  }
  if (feature !== undefined && state.plan !== undefined) {
    if (state.plan.featureId !== feature.id) mismatches.push(`plan:${state.plan.featureId}`);
    if (state.plan.featureSlug !== feature.slug) mismatches.push(`plan:${state.plan.featureSlug}`);
  }
  if (task !== undefined) {
    const graphMatches =
      state.taskGraph?.tasks.filter((candidate) => candidate.id === task.id) ?? [];
    if (state.taskGraph === undefined) {
      mismatches.push("task-graph:missing");
    } else if (graphMatches.length === 0) {
      mismatches.push(`task-graph:missing-task:${task.id}`);
    } else if (graphMatches.length > 1) {
      mismatches.push(`task-graph:duplicate-task:${task.id}`);
    } else if (canonicalJsonV1(graphMatches[0]) !== canonicalJsonV1(task)) {
      mismatches.push(`task-graph:stale-task:${task.id}`);
    }
  }
  if (state.contextPack !== undefined) {
    if (feature === undefined || state.contextPack.featureId !== feature.id) {
      mismatches.push(`context-feature:${state.contextPack.featureId}`);
    }
    if (feature === undefined || state.contextPack.featureSlug !== feature.slug) {
      mismatches.push(`context-slug:${state.contextPack.featureSlug}`);
    }
    if (task === undefined || state.contextPack.taskId !== task.id) {
      mismatches.push(`context-task:${state.contextPack.taskId}`);
    }
    if (task === undefined || state.contextPack.selectedTask.id !== task.id) {
      mismatches.push(`context-selected-task:${state.contextPack.selectedTask.id}`);
    } else if (
      canonicalJsonV1(stableTaskSource(state.contextPack.selectedTask)) !==
      canonicalJsonV1(stableTaskSource(task))
    ) {
      mismatches.push(`context-selected-task:stale:${task.id}`);
    }
  }

  if (mismatches.length > 0) {
    addFinding(
      {
        code: "VISP.CONTRACT.SOURCE_IDENTITY_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Task-scoped source artifacts disagree with selected project identity.",
        recommendation: "Regenerate the selected task context from coherent feature artifacts.",
        evidence: mismatches
      },
      true
    );
  }
}

function projectStateFindings(
  state: ProjectState,
  nextCommand: string,
  addFinding: AddFinding
): void {
  for (const error of state.errors) {
    addFinding(
      {
        code: "VISP.CONTRACT.PROJECT_STATE_ERROR",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: error,
        recommendation: "Resolve the exact project selection error and recompute the action.",
        evidence: [error]
      },
      true
    );
  }

  for (const warning of state.warnings) {
    addFinding({
      code: "VISP.WORKFLOW.WARNING",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: warning,
      recommendation: nextCommand,
      evidence: [warning]
    });
  }

  if (state.selectedFeature !== undefined && state.selectedFeature.intent === undefined) {
    const intentPath = `${state.selectedFeature.relativePath}/intent.json`;
    addFinding(
      {
        code: "VISP.CONTRACT.FEATURE_INTENT_UNAVAILABLE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The selected feature intent is missing or invalid.",
        recommendation: "Restore or regenerate a valid feature intent before using this action.",
        evidence: [intentPath]
      },
      true
    );
  }
}

function readCandidates(state: ProjectState, featurePath: string | undefined): ReadCandidate[] {
  const candidates: ReadCandidate[] = [];
  if (state.initialized) {
    candidates.push({ id: "project-policy", role: "policy", path: ".visp/policy.json" });
  }
  if (featurePath === undefined) return candidates;

  candidates.push({
    id: "feature-intent",
    role: "intent",
    path: `${featurePath}/intent.json`
  });
  if (state.artifactSummary.spec) {
    candidates.push({
      id: "feature-specification",
      role: "specification",
      path: `${featurePath}/spec.json`
    });
  }
  if (state.artifactSummary.plan) {
    candidates.push({ id: "feature-plan", role: "plan", path: `${featurePath}/plan.json` });
  }
  if (state.artifactSummary.taskGraph) {
    candidates.push({
      id: "task-graph",
      role: "task_graph",
      path: `${featurePath}/task-graph.json`
    });
  }
  if (state.selectedTask !== undefined && state.artifactSummary.context) {
    candidates.push({
      id: "task-context",
      role: "context_pack",
      path: `${featurePath}/context/${state.selectedTask.id}.context.json`
    });
    candidates.push({
      id: "implementation-prompt",
      role: "implementation_prompt",
      path: ".visp/prompts/current-task.prompt.md"
    });
  }

  return candidates;
}

async function collectRequiredReads(
  state: ProjectState,
  candidates: readonly ReadCandidate[],
  addFinding: AddFinding,
  v2FindingOrder: Sha256Hash[]
): Promise<HashedRead[]> {
  const reads: HashedRead[] = [];

  for (const candidate of candidates) {
    const safePath = normalizeProjectPath(candidate.path, addFinding);
    if (safePath === undefined) continue;
    try {
      const contents = await readFile(path.join(state.targetPath, safePath));
      reads.push({
        id: candidate.id,
        role: candidate.role,
        path: safePath,
        contentHash: `sha256:${createHash("sha256").update(contents).digest("hex")}`,
        freshness: "content_hash"
      });
    } catch {
      const finding: Finding = {
        code: "VISP.FRESHNESS.REQUIRED_READ_UNAVAILABLE",
        source: "freshness",
        severity: "error",
        effect: "uncertain",
        message: `Required read is unavailable: ${safePath}.`,
        recommendation: "Restore or regenerate the required read before using this action.",
        evidence: [safePath]
      };
      addFinding(finding);
      v2FindingOrder.push(canonicalFindingReference(finding));
    }
  }

  return reads.sort((left, right) => {
    const roleDifference = readRoleOrder[left.role] - readRoleOrder[right.role];
    if (roleDifference !== 0) return roleDifference;
    const pathDifference = compareUtf16CodeUnits(left.path, right.path);
    return pathDifference !== 0 ? pathDifference : compareUtf16CodeUnits(left.id, right.id);
  });
}

function featureStagePaths(
  phase: CanonicalWorkflowPhase,
  featurePath: string | undefined
): string[] | undefined {
  if (featurePath === undefined) return undefined;
  if (phase === "clarify") return [`${featurePath}/clarifications.json`];
  if (phase === "spec") {
    return [`${featurePath}/spec.json`, `${featurePath}/traceability.json`];
  }
  if (phase === "plan") return [`${featurePath}/plan.json`];
  if (phase === "tasks" || phase === "context") {
    return [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`];
  }
  return undefined;
}

function actionScope(input: {
  readonly phase: CanonicalWorkflowPhase;
  readonly featurePath?: string;
  readonly task?: Task;
  readonly addFinding: AddFinding;
}): {
  readonly scope: CanonicalWorkflowActionIdentityInput["scope"];
  readonly presentation: Pick<
    CanonicalWorkflowActionV2Presentation,
    "writablePaths" | "forbiddenPaths"
  >;
} {
  const featurePaths = featureStagePaths(input.phase, input.featurePath);
  if (featurePaths !== undefined) {
    const writable = normalizePathSetWithPresentation(featurePaths, input.addFinding);
    const forbidden = normalizePathSetWithPresentation(
      input.task?.forbiddenFiles ?? [],
      input.addFinding
    );
    return {
      scope: {
        writablePaths: writable.values,
        expectedPaths: available(writable.values),
        forbiddenPaths: forbidden.values,
        operationLimits: unavailable("not_captured")
      },
      presentation: {
        writablePaths: writable.presentation,
        forbiddenPaths: forbidden.presentation
      }
    };
  }

  const forbidden = normalizePathSetWithPresentation(
    input.task?.forbiddenFiles ?? [],
    input.addFinding
  );
  const usesTaskScope = input.phase === "implement" || input.phase === "pr";
  if (usesTaskScope && input.task !== undefined) {
    const expectedResult =
      input.task.expectedFiles === undefined
        ? undefined
        : normalizePathSetWithPresentation(input.task.expectedFiles, input.addFinding);
    const expected =
      expectedResult === undefined
        ? unavailable<readonly string[]>("not_in_source_artifact")
        : available<readonly string[]>(expectedResult.values);
    const writable = normalizePathSetWithPresentation(
      [...new Set([...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])])],
      input.addFinding
    );
    return {
      scope: {
        writablePaths: writable.values,
        expectedPaths: expected,
        forbiddenPaths: forbidden.values,
        operationLimits: unavailable("not_captured")
      },
      presentation: {
        writablePaths: writable.presentation,
        forbiddenPaths: forbidden.presentation
      }
    };
  }

  return {
    scope: {
      writablePaths: [],
      expectedPaths: usesTaskScope
        ? notApplicable("no_active_task")
        : input.featurePath === undefined && input.phase === "feature"
          ? notApplicable("no_active_feature")
          : notApplicable("stage_does_not_require_value"),
      forbiddenPaths: forbidden.values,
      operationLimits: unavailable("not_captured")
    },
    presentation: {
      writablePaths: [],
      forbiddenPaths: forbidden.presentation
    }
  };
}

function claimContext(
  state: ProjectState,
  addFinding: AddFinding
): {
  readonly claims: DeclaredValue<readonly RequirementClaim[]>;
  readonly oracles: readonly ValidationOracle[];
  readonly oracleOrder: readonly string[];
} {
  const task = state.selectedTask;
  if (task === undefined) {
    const source = state.spec;
    if (source === undefined) {
      return {
        claims: notApplicable("no_active_task"),
        oracles: [],
        oracleOrder: []
      };
    }
    const duplicateRequirements = duplicateValues(source.requirements.map(({ id }) => id));
    const duplicateCriteria = duplicateValues(source.acceptanceCriteria.map(({ id }) => id));
    const requirementIds = new Set(source.requirements.map(({ id }) => id));
    const invalidCriteria = source.acceptanceCriteria.filter(
      (criterion) => !requirementIds.has(criterion.requirementId)
    );
    const crossFeatureRequirements = source.requirements.filter(
      (requirement) =>
        state.selectedFeature !== undefined && requirement.featureId !== state.selectedFeature.id
    );
    if (duplicateRequirements.length > 0 || duplicateCriteria.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.CLAIM_MAPPING_DUPLICATE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Task claim sources contain duplicate stable IDs.",
        recommendation: "Regenerate the task claim source with one record per stable ID.",
        evidence: [
          ...duplicateRequirements.map((id) => `requirement:${id}`),
          ...duplicateCriteria.map((id) => `criterion:${id}`)
        ]
      });
    }
    if (crossFeatureRequirements.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.REQUIREMENT_FEATURE_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "One or more mapped requirements belong to another feature.",
        recommendation: "Regenerate task mappings from the active feature specification.",
        evidence: crossFeatureRequirements.map(
          (requirement) => `${requirement.id}:${requirement.featureId}`
        )
      });
    }
    if (invalidCriteria.length > 0) {
      addFinding({
        code: "VISP.CONTRACT.CRITERION_MAPPING_MISSING",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "One or more task criterion mappings are absent or contradict their claim.",
        recommendation: "Regenerate criterion bindings without inventing replacement oracles.",
        evidence: invalidCriteria.map((criterion) => `${criterion.id}:${criterion.requirementId}`)
      });
    }
    if (
      duplicateRequirements.length > 0 ||
      duplicateCriteria.length > 0 ||
      crossFeatureRequirements.length > 0 ||
      invalidCriteria.length > 0
    ) {
      return {
        claims: notApplicable("no_active_task"),
        oracles: [],
        oracleOrder: []
      };
    }
    const oracles: ValidationOracle[] = source.acceptanceCriteria.map((criterion) => ({
      id: criterion.id,
      claimId: criterion.requirementId,
      statement: criterion.description,
      testable: criterion.testable,
      validationMethod: criterion.validationMethod
    }));
    const oracleOrder = oracles.map(({ id }) => id);
    oracles.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
    return {
      claims: notApplicable("no_active_task"),
      oracles,
      oracleOrder
    };
  }

  if (task.requirementIds.length === 0 && task.acceptanceCriterionIds.length === 0) {
    return { claims: available([]), oracles: [], oracleOrder: [] };
  }

  const source = state.contextPack ?? state.spec;
  if (source === undefined) {
    addFinding({
      code: "VISP.CONTRACT.CLAIM_SOURCE_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "The selected task has claim bindings but no context or specification source.",
      recommendation: "Generate or restore the selected task context and specification.",
      evidence: [...task.requirementIds, ...task.acceptanceCriterionIds]
    });
    return { claims: unavailable("source_missing"), oracles: [], oracleOrder: [] };
  }

  const requirements = (
    "includedRequirements" in source ? source.includedRequirements : source.requirements
  ).filter((requirement) => task.requirementIds.includes(requirement.id));
  const criteria = (
    "includedAcceptanceCriteria" in source
      ? source.includedAcceptanceCriteria
      : source.acceptanceCriteria
  ).filter((criterion) => task.acceptanceCriterionIds.includes(criterion.id));
  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  const criterionIds = new Set(criteria.map((criterion) => criterion.id));
  const duplicateRequirements = duplicateValues(requirements.map((requirement) => requirement.id));
  const duplicateCriteria = duplicateValues(criteria.map((criterion) => criterion.id));
  const missingRequirements = task.requirementIds.filter((id) => !requirementIds.has(id));
  const missingCriteria = task.acceptanceCriterionIds.filter((id) => !criterionIds.has(id));
  const invalidCriteria = criteria.filter(
    (criterion) => !requirementIds.has(criterion.requirementId)
  );
  const crossFeatureRequirements = requirements.filter(
    (requirement) =>
      state.selectedFeature !== undefined && requirement.featureId !== state.selectedFeature.id
  );

  if (duplicateRequirements.length > 0 || duplicateCriteria.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.CLAIM_MAPPING_DUPLICATE",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "Task claim sources contain duplicate stable IDs.",
      recommendation: "Regenerate the task claim source with one record per stable ID.",
      evidence: [
        ...duplicateRequirements.map((id) => `requirement:${id}`),
        ...duplicateCriteria.map((id) => `criterion:${id}`)
      ]
    });
  }
  if (crossFeatureRequirements.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.REQUIREMENT_FEATURE_MISMATCH",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more mapped requirements belong to another feature.",
      recommendation: "Regenerate task mappings from the active feature specification.",
      evidence: crossFeatureRequirements.map(
        (requirement) => `${requirement.id}:${requirement.featureId}`
      )
    });
  }

  if (missingRequirements.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.REQUIREMENT_MAPPING_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more task requirement mappings are absent from the authoritative source.",
      recommendation: "Regenerate task mappings without inventing replacement requirements.",
      evidence: missingRequirements
    });
  }
  if (missingCriteria.length > 0 || invalidCriteria.length > 0) {
    addFinding({
      code: "VISP.CONTRACT.CRITERION_MAPPING_MISSING",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "One or more task criterion mappings are absent or contradict their claim.",
      recommendation: "Regenerate criterion bindings without inventing replacement oracles.",
      evidence: [
        ...missingCriteria,
        ...invalidCriteria.map((criterion) => `${criterion.id}:${criterion.requirementId}`)
      ]
    });
  }

  const sourceInvalid =
    duplicateRequirements.length > 0 ||
    duplicateCriteria.length > 0 ||
    crossFeatureRequirements.length > 0 ||
    missingRequirements.length > 0 ||
    missingCriteria.length > 0 ||
    invalidCriteria.length > 0;
  if (sourceInvalid) {
    return { claims: unavailable("source_invalid"), oracles: [], oracleOrder: [] };
  }

  const claims: RequirementClaim[] = requirements.map((requirement) => ({
    id: requirement.id,
    statement: requirement.description,
    priority: requirement.priority,
    acceptanceCriterionIds: sortUnique(
      criteria
        .filter((criterion) => criterion.requirementId === requirement.id)
        .map((criterion) => criterion.id)
    ),
    accountableOwner: unavailable("not_in_source_artifact")
  }));
  claims.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));

  const oracles: ValidationOracle[] = criteria.map((criterion) => ({
    id: criterion.id,
    claimId: criterion.requirementId,
    statement: criterion.description,
    testable: criterion.testable,
    validationMethod: criterion.validationMethod
  }));
  const oracleOrder = oracles.map(({ id }) => id);
  oracles.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));

  return { claims: available(claims), oracles, oracleOrder };
}

function policyStatus(state: ProjectState, addFinding: AddFinding): DeclaredValue<PolicyStatus> {
  const direct = state.contextPack?.policyStatus;
  const gate = state.contextPack?.policyGate?.policyStatus;
  if (direct !== undefined && gate !== undefined && direct !== gate) {
    addFinding(
      {
        code: "VISP.CONTRACT.POLICY_STATUS_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Context policy status and gate policy status disagree.",
        recommendation: "Regenerate context from one coherent policy evaluation.",
        evidence: [direct, gate]
      },
      true
    );
    return unavailable("source_invalid");
  }
  const value = direct ?? gate;
  return value === undefined ? unavailable("not_captured") : available(value);
}

function stepFindings(step: NextStep, addFinding: AddFinding, v2FindingOrder: Sha256Hash[]): void {
  const failedRules = step.failedRules ?? [];
  const hasBlockingRule = failedRules.some((rule) => rule.severity === "error");

  if (step.nextAllowedCommand !== undefined && step.nextAllowedCommand !== step.nextCommand) {
    addFinding(
      {
        code: "VISP.CONTRACT.NEXT_COMMAND_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The evaluated next command disagrees with the authoritative allowed command.",
        recommendation: "Re-evaluate the authoritative Kit gate for the exact next action.",
        evidence: [step.nextCommand, step.nextAllowedCommand]
      },
      true
    );
  }

  for (const rule of failedRules) {
    addFinding({
      code: rule.ruleId,
      source: "policy",
      severity: rule.severity,
      effect: step.allowed === false && rule.severity === "error" ? "blocks" : "none",
      message: rule.message,
      recommendation: rule.recommendation,
      evidence: [rule.evidence]
    });
  }

  if (step.allowed === undefined || (step.allowed === false && !hasBlockingRule)) {
    addFinding(
      {
        code: "VISP.CONTRACT.AUTHORITY_UNAVAILABLE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The next-step input does not contain a coherent permission decision.",
        recommendation: "Re-evaluate the authoritative Kit gate for the exact next action.",
        evidence: [step.nextCommand]
      },
      true
    );
  }

  for (const blocker of step.blockers) {
    const finding: Finding = {
      code: "VISP.WORKFLOW.STATE_BLOCKER",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: blocker,
      recommendation: step.nextCommand,
      evidence: [blocker]
    };
    addFinding(finding);
    if (step.allowed === false) {
      v2FindingOrder.push(canonicalFindingReference(finding));
    }
  }
  for (const warning of step.warnings) {
    addFinding({
      code: "VISP.WORKFLOW.WARNING",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: warning,
      recommendation: step.nextCommand,
      evidence: [warning]
    });
  }
}

function verdict(findings: readonly Finding[], decisionContradiction: boolean): ActionVerdict {
  if (decisionContradiction) return "inconclusive";
  if (findings.some((finding) => finding.effect === "blocks")) return "blocked";
  if (findings.some((finding) => finding.effect === "uncertain")) return "inconclusive";
  return "ready";
}

export async function buildCanonicalWorkflowActionEnvelope(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<CanonicalWorkflowActionEnvelope> {
  const pendingFindings: Finding[] = [];
  const v2ReadFindingOrder: Sha256Hash[] = [];
  const v2BlockerFindingOrder: Sha256Hash[] = [];
  let decisionContradiction = false;
  const addFinding: AddFinding = (finding, invalidatesDecision = false) => {
    pendingFindings.push(finding);
    if (invalidatesDecision) decisionContradiction = true;
  };

  const phase = phaseFromState(input.step.state);
  if (phase === "next") {
    addFinding(
      {
        code: "VISP.CONTRACT.WORKFLOW_STATE_UNKNOWN",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: `Workflow state is not mapped by canonical version 1.0: ${JSON.stringify(input.step.state)}.`,
        recommendation: "Upgrade Kit or recompute the action from a recognized workflow state.",
        evidence: [input.step.state]
      },
      true
    );
  }
  projectStateFindings(input.state, input.step.nextCommand, addFinding);
  identityFindings(input.state, input.step, addFinding);
  sourceIdentityFindings(input.state, addFinding);
  stepFindings(input.step, addFinding, v2BlockerFindingOrder);

  const featurePath =
    input.state.selectedFeature === undefined
      ? undefined
      : normalizeProjectPath(input.state.selectedFeature.relativePath, addFinding);
  const reads = await collectRequiredReads(
    input.state,
    readCandidates(input.state, featurePath),
    addFinding,
    v2ReadFindingOrder
  );
  const scopeSelection = actionScope({
    phase,
    featurePath,
    task: input.state.selectedTask,
    addFinding
  });
  const claimSelection = claimContext(input.state, addFinding);
  const strictness = strictnessContext(input.step.strictnessMode, addFinding);
  const goal =
    input.state.selectedTask?.description ??
    input.state.selectedFeature?.intent?.rawUserRequest ??
    input.step.reason;

  if (goal.trim().length === 0) {
    throw new TypeError("canonical-workflow-action: goal must be non-empty");
  }
  if (input.step.nextCommand.trim().length === 0) {
    throw new TypeError("canonical-workflow-action: nextCommand must be non-empty");
  }

  const task = input.state.selectedTask;
  const identityInput: CanonicalWorkflowActionIdentityInput = {
    canonicalVersion: "1.0",
    phase,
    feature:
      input.state.selectedFeature === undefined
        ? null
        : { id: input.state.selectedFeature.id, slug: input.state.selectedFeature.slug },
    task:
      task === undefined
        ? null
        : {
            id: task.id,
            title: task.title,
            status: task.status,
            dependsOn: sortUnique(task.dependsOn),
            parallelizable: task.parallelizable
          },
    taskClass:
      task === undefined ? notApplicable("no_active_task") : unavailable("not_in_source_artifact"),
    risk: {
      level: task === undefined ? notApplicable("no_active_task") : available(task.riskLevel),
      factors:
        task === undefined ? notApplicable("no_active_task") : unavailable("not_in_source_artifact")
    },
    assurance: {
      level: strictness.level,
      profile: unavailable("not_in_source_artifact"),
      workflowStrictness: strictness.workflowStrictness
    },
    goal,
    baseCommit: unavailable("not_captured"),
    requiredReads: reads,
    scope: scopeSelection.scope,
    claims: claimSelection.claims,
    validationOracles: claimSelection.oracles,
    validationCommands: [
      ...(input.state.contextPack?.validationCommands ?? task?.validationCommands ?? [])
    ],
    requiredEvidence: unavailable("not_in_source_artifact"),
    policy: {
      status: policyStatus(input.state, addFinding),
      appliedOverrides: unavailable("not_captured")
    },
    findings: [],
    verdict: "ready",
    nextCommand: input.step.nextCommand
  };

  const finalFindings = normalizedFindings(pendingFindings);
  const finalIdentityInput: CanonicalWorkflowActionIdentityInput = {
    ...identityInput,
    findings: finalFindings,
    verdict: verdict(finalFindings, decisionContradiction)
  };
  const actionId = createWorkflowActionId(finalIdentityInput);
  const { canonicalVersion, ...actionBody } = finalIdentityInput;

  const action: CanonicalWorkflowAction = {
    canonicalVersion,
    actionId,
    ...actionBody
  };
  return {
    action,
    v2Presentation: {
      writablePaths: scopeSelection.presentation.writablePaths,
      forbiddenPaths: scopeSelection.presentation.forbiddenPaths,
      oracleOrder: claimSelection.oracleOrder,
      findingOrder: [...v2ReadFindingOrder, ...v2BlockerFindingOrder]
    }
  };
}

export async function buildCanonicalWorkflowAction(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<CanonicalWorkflowAction> {
  return (await buildCanonicalWorkflowActionEnvelope(input)).action;
}

export function canonicalWorkflowActionJson(action: CanonicalWorkflowAction): string {
  return canonicalJsonV1(action);
}
