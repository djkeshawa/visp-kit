import {
  type ContextPack,
  type ContextUnderstanding
} from "../artifacts/schemas/context-pack.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { type IntelFileGraph } from "../scanner/intel-graph.js";
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { type ContextBudgetPolicy } from "./context-budget.js";
import { estimateJsonTokens, estimateTokens, tokenEstimatorName } from "./token-estimator.js";
import { findReuseHelpers } from "./reuse-helpers.js";
import { uniqueTrimmed as unique } from "../core/collections.js";
import {
  compactText,
  parseCompactRules,
  selectAcceptanceCriteria,
  selectDependencyTasks,
  selectPlanDecisions,
  selectPlanRisks,
  selectRequirements,
  validationCommands
} from "./context-artifact-selection.js";
import { buildFileContexts } from "./context-file-selection.js";

export { understandingFilePaths } from "./context-selector-budget.js";

export type ContextSelectionInput = {
  readonly targetPath: string;
  readonly feature: ActiveFeature;
  readonly taskGraph: TaskGraphArtifact;
  readonly task: Task;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
  readonly now: string;
  readonly spec?: SpecArtifact;
  readonly plan?: PlanDraftArtifact;
  readonly compactConstitution?: string;
  readonly projectSummary?: string;
  readonly patterns?: string;
  readonly fileIndex?: readonly FileIndexEntry[];
  readonly fileSummaries?: readonly FileSummary[];
  readonly projectProfile?: ProjectProfile;
  /**
   * The compact task model (ADR 0014 Q3), present only when a CURRENT
   * understanding case exists. Its presence is what switches the pack from
   * "everything that might be relevant" to "the cited path plus what is being
   * changed". Absent, every line below behaves exactly as it did before.
   */
  readonly understanding?: ContextUnderstanding;
  /**
   * Intel's consumer projection, collapsed to file grain, when this project has
   * a current one on disk.
   *
   * It carries FACTS ONLY — which files import which, which files test which,
   * at a stated snapshot. It carries no score, no threshold, no readiness flag
   * and no budget, and there is deliberately nowhere for one to arrive: every
   * number that turns these facts into a selection is a literal in this file.
   *
   * Absent, every line below behaves exactly as it did before intel existed.
   * That is asserted, not hoped for: the absence test compares whole packs.
   */
  readonly fileGraph?: IntelFileGraph;
  readonly warnings: readonly string[];
};

export async function selectContextPack(input: ContextSelectionInput): Promise<ContextPack> {
  const warnings = [...input.warnings];

  if (input.compactConstitution === undefined) {
    warnings.push("Compact constitution is missing; used fallback implementation rules.");
  }

  if (input.fileIndex === undefined || input.fileSummaries === undefined) {
    warnings.push("Scan cache is incomplete; run `visp-kit scan` for better file context.");
  }

  const requirements = selectRequirements({
    task: input.task,
    spec: input.spec,
    warnings
  });
  const acceptanceCriteria = selectAcceptanceCriteria({
    task: input.task,
    requirements,
    spec: input.spec,
    warnings
  });
  const requirementIds = requirements.map((requirement) => requirement.id);
  const planDecisions = selectPlanDecisions(input.plan, requirementIds);
  const planRisks = selectPlanRisks(input.plan, requirementIds);
  const validation = validationCommands({
    task: input.task,
    plan: input.plan,
    projectProfile: input.projectProfile,
    warnings
  });
  const fileContexts = await buildFileContexts({
    targetPath: input.targetPath,
    policy: input.policy,
    includeFullFiles: input.includeFullFiles,
    task: input.task,
    plan: input.plan,
    fileIndex: input.fileIndex ?? [],
    fileSummaries: input.fileSummaries ?? [],
    ...(input.understanding === undefined ? {} : { understanding: input.understanding }),
    ...(input.fileGraph === undefined ? {} : { fileGraph: input.fileGraph }),
    warnings
  });
  const constraints = unique([
    ...input.task.allowedFiles.map((file) => `Allowed file: ${file}`),
    ...(input.task.expectedFiles ?? []).map((file) => `Expected file: ${file}`),
    ...(input.task.forbiddenFiles ?? []).map((file) => `Forbidden file: ${file}`),
    "Implement only the selected task.",
    "Do not add unrelated refactoring.",
    "Do not introduce dependencies unless this task explicitly allows it."
  ]);
  // What scan already knows, handed to whoever writes the code. Not gated on
  // the summary/pattern budget switches: a one-line pointer at an existing
  // redaction helper is the cheapest and highest-value thing in this pack.
  const reuseHelpers = findReuseHelpers(
    (input.fileSummaries ?? []).map((summary) => ({
      path: summary.path,
      symbols: summary.symbols ?? []
    }))
  );
  // Dropped in compact mode: projectSummary and patterns are free text about
  // the repository as a whole, and the compact constitution already carries
  // the part of it that constrains the edit. reuseHelpers is NOT dropped with
  // them — it is the regex helper list behind the only measured behaviour win
  // in this project (credential leaks 0 of 4 versus 3 of 4), it is not
  // graph-derived, and the graph does not replace it.
  // COMPACTION IS TASK-SCOPED EVIDENCE OR IT IS NOTHING. `compact` is the mode
  // that WITHHOLDS whole-file bodies, and it may only ever be set by the
  // understanding case — an artifact somebody had to author for THIS task.
  //
  // `input.fileGraph` must never appear in this expression. The projection is
  // repository-wide and present on every task the moment intel has run once, so
  // if it could set `compact`, indexing a repository would shrink every pack in
  // it forever with no per-task evidence behind a single one of them. The
  // measured cost of compaction firing without task evidence is already on the
  // record at -78.3% bodied recall over 17 runs; this is the one line where
  // that mistake would be repeated at repository scale, and it is asserted in
  // the tests rather than left to review.
  //
  // `input.policy.compactSnippetCap` must never appear here either, and for a
  // narrower reason: the cap is measured, and what it is measured to do is
  // remove snippet TEXT at unchanged bodied file recall. Dropping the project
  // summary and the patterns is a different deletion that nobody has measured
  // alongside it, and the arm F pack that produced -49.49% carried both of
  // them. Folding them in here would ship a configuration nobody ran under a
  // number somebody did. Read that -49.49% narrowly: bodied recall held because
  // the capped pack named the same files, and bodied recall equals listed
  // recall in that harness (a file counts as bodied on a non-empty summary, and
  // Kit summarises everything it lists) — it is the same file list for half the
  // tokens, not the same information, and it was balanced mode on two
  // repositories. (Two superseded pairs: -52.01% was a visp-dev measurement
  // build, not producible on shipped Kit; -51.08% was this same shipped-binary
  // run on the 28-record cohort, before seven author-dependent records were
  // reclassified out. Quote -49.49%.)
  const compact = input.understanding !== undefined;
  const projectContext = {
    summary:
      input.policy.includeProjectSummary && !compact
        ? compactText(input.projectSummary, input.policy.outputStyle === "compact" ? 12 : 20)
        : "",
    patterns:
      input.policy.includePatterns && !compact
        ? compactText(input.patterns, input.policy.outputStyle === "detailed" ? 16 : 10)
        : "",
    ...(reuseHelpers.length > 0
      ? { reuseHelpers: reuseHelpers.map((h) => ({ ...h, symbols: [...h.symbols] })) }
      : {}),
    warnings: []
  };

  return {
    id: `CTX-${input.task.id}`,
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    taskId: input.task.id,
    budgetMode: input.policy.mode,
    snippetCapApplied: input.policy.compactSnippetCap,
    estimatedTokens: {
      input: 0,
      expectedOutput: input.policy.expectedOutputTokens,
      total: input.policy.expectedOutputTokens,
      maxInput: input.policy.maxInputTokens,
      mode: input.policy.mode,
      estimator: tokenEstimatorName
    },
    overBudget: false,
    recommendation: "OK",
    warnings,
    selectedTask: input.task,
    includedRequirements: [...requirements],
    includedAcceptanceCriteria: [...acceptanceCriteria],
    includedPlanDecisions: planDecisions,
    includedRisks: planRisks,
    includedDependencyTasks: selectDependencyTasks(input.taskGraph, input.task),
    includedConstitutionRules: parseCompactRules(input.compactConstitution),
    includedProjectContext: projectContext,
    ...(input.understanding === undefined ? {} : { understanding: input.understanding }),
    artifactProvenance: [],
    includedFiles: fileContexts.map((context) => context.file),
    includedSnippets: fileContexts
      .map((context) => context.snippet)
      .filter(
        (snippet): snippet is ContextPack["includedSnippets"][number] => snippet !== undefined
      ),
    validationCommands: [...validation],
    constraints: [...constraints],
    instructions: [
      `Use this context to implement only ${input.task.id}.`,
      "Keep changes minimal and traceable to the listed requirements.",
      "Run the validation commands after implementation.",
      "Do not implement other tasks."
    ],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function estimateContextPackInputTokens(pack: ContextPack, markdown: string): number {
  return Math.max(estimateTokens(markdown), estimateJsonTokens(pack));
}
