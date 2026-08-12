import {
  type ContextPack,
  type ContextUnderstanding
} from "../artifacts/schemas/context-pack.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import {
  type AcceptanceCriterion,
  type Requirement
} from "../artifacts/schemas/requirement.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type ProjectProfile } from "../artifacts/schemas/project.schema.js";
import { compareByCodepoint, normalizeRepositoryPath } from "../core/paths.js";
import { shouldIgnorePath, isBinaryPath, isLockFile } from "../scanner/ignore-rules.js";
import { type IntelFileGraph } from "../scanner/intel-graph.js";
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";
import { type ContextBudgetPolicy } from "./context-budget.js";
import { extractFileSnippet } from "./file-snippets.js";
import { structuralProximity } from "./structural-proximity.js";
import { estimateJsonTokens, estimateTokens, tokenEstimatorName } from "./token-estimator.js";
import { findReuseHelpers } from "./reuse-helpers.js";

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

/**
 * Compact-pack budgets (ADR 0014 Q3), revised by the Phase 21 measurement.
 *
 * The first version of this made path membership a FILTER: a file the cited
 * path did not name lost its body. Measured over the 29 capability-eligible
 * holdout tasks that bought −66.1% tokens for −78.3% bodied file recall and
 * −80.3% symbol recall, because intel traces no path at all on 17 of those 29
 * and the selector inherited every miss as a dropped file.
 *
 * The objective was never minimum tokens; it is the best localisation per
 * token. So the revision splits a "body" by what it actually costs:
 *
 *   - a file SUMMARY (imports, exports, symbols, comments) is ~300 tokens and
 *     is what carries symbol recall;
 *   - a SNIPPET is up to `maxSnippetTokensPerFile` — 1,000 in `balanced` — and
 *     is where the pack's bulk always was.
 *
 * Every in-scope file therefore keeps its summary, and path membership decides
 * only who gets the expensive body. That makes the path a RANKING signal: it
 * can promote a file to a snippet, and it can no longer silence one.
 */
const COMPACT_MAX_SNIPPET_FILES = 4;
const COMPACT_MAX_SNIPPET_LINES = 40;
/**
 * Snippet slots the relevance ranking keeps even when the cited path could
 * fill every one of them.
 *
 * This is the floor that makes a thin path never worse than no path. Intel's
 * path covered 0.112 of the human patch across the holdout: a path is good
 * evidence about what it names and says nothing about what it does not, so it
 * may take slots and it may not take the pack.
 */
const COMPACT_MIN_RELEVANCE_SNIPPET_FILES = 2;
/** Snippet slots the cited path may take. */
const COMPACT_PATH_SNIPPET_BUDGET = Math.max(
  0,
  COMPACT_MAX_SNIPPET_FILES - COMPACT_MIN_RELEVANCE_SNIPPET_FILES
);
/**
 * Files the cited path names that the relevance ranking would not have
 * selected at all.
 *
 * They are ADDED, never substituted, so the bodied set in compact mode is a
 * superset of the set the same pack would carry with no case at all. That
 * monotonicity — more path information never removes a body — is the property
 * the Phase 21 defect broke, and it is asserted in the tests.
 *
 * The bound is the path's snippet budget, deliberately, and not a number of
 * its own: a file the ranking rejected is worth adding only if the path can
 * also afford to show its code. Adding more than that would be spending
 * summaries on files two independent signals scored low, which is the
 * "flood the pack with weakly-relevant files" failure the compact pack exists
 * to avoid.
 */
const COMPACT_MAX_PATH_ONLY_FILES = COMPACT_PATH_SNIPPET_BUDGET;

/**
 * Structural admission (Phase 22), and why every number below is here rather
 * than in the artifact it reads.
 *
 * Intel states that `a.ts` imports `b.ts`. It does not state that `b.ts` is
 * worth 0.5, that 0.5 is enough to earn a place in a pack, or that two places
 * are what a task can afford. Those three are Kit's judgement about intel's
 * facts, they are visible in Kit's diff, and the day any of them arrives from
 * the artifact instead, intel is deciding.
 *
 * The shape is `orderByPathMembership`'s, on purpose. That shape is the
 * corrected form of the Phase 21 defect, and the properties it was corrected
 * into are the ones this must not break:
 *
 *  - ADDITIVE. Structure appends; it never displaces and never filters. The
 *    bodied set with a graph is a SUPERSET of the bodied set without one, so no
 *    graph fact can take a file's body away. A signal that can do that is
 *    deciding what the model may not see, and that is the one power that stays
 *    out.
 *  - FLOORED. Every one of the lexical ranking's `maxFiles` slots survives
 *    untouched. Text relevance earned 0.4831/0.4900 bodied recall on its own;
 *    structure is layered on top of it, not traded against it.
 *  - BOUNDED, AND CHEAPLY. Admitted files get a summary (~300 tokens) and never
 *    a snippet, so the whole mechanism costs at most ~600 tokens against a
 *    9,675-token mean. `allocateSnippets` and the trimmer do not see them.
 */
const STRUCT_MAX_ADMITTED_FILES = 2;
/**
 * The proximity an admitted file must clear: hop 1 and hop 1 only.
 *
 * A hop-2 file is "something that talks to something the task touches", which
 * is a claim about the tree that is true of most of a codebase. It stays in the
 * map (it is a real fact) and it never buys a slot.
 */
const STRUCT_MIN_ADMISSION_PROXIMITY = 0.5;
/**
 * How many lexical hits seed the expansion when the task declares no files.
 *
 * Three, because these seeds are UNMEASURED — nobody has recorded the precision
 * of the top-3 text hits on this cohort — and a wrong seed expands a wrong
 * neighbourhood. Three keeps the blast radius at the two files
 * `STRUCT_MAX_ADMITTED_FILES` already bounds, and makes seed precision a thing
 * a measurement can report before anything is bought with it.
 */
const STRUCT_MAX_LEXICAL_SEEDS = 3;

/**
 * The cited path when nothing cites one.
 *
 * Not a fake case: it is the empty set of files an absent case names, which is
 * what it names. Every rule below that reads `onPath` reads it as evidence —
 * "was this file cited?" — and the answer for all of them, correctly, is no.
 */
const EMPTY_PATH_SET: ReadonlySet<string> = new Set();

/**
 * Files the compact pack may show code for: those holding an entity on the
 * cited path or in the candidate change set.
 *
 * The membership decision upstream is by entity id; these are the file paths
 * those ids resolved to. A path is an identity within one snapshot of one
 * repository, which is the only reason it is safe to compare here.
 */
export function understandingFilePaths(understanding: ContextUnderstanding): ReadonlySet<string> {
  const paths = new Set<string>();
  const add = (filePath: string | null): void => {
    // Normalised on the way in, because every caller compares these against
    // scan's index, which is forward-slashed.
    if (filePath !== null) paths.add(filePath.replaceAll("\\", "/"));
  };

  for (const row of understanding.path) {
    add(row.sourceFilePath);
    add(row.targetFilePath);
  }

  for (const signature of understanding.signatures) {
    add(signature.filePath);
  }

  return paths;
}

type FileContext = {
  readonly file: ContextPack["includedFiles"][number];
  readonly snippet?: ContextPack["includedSnippets"][number];
};

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function taskKeywords(task: Task): readonly string[] {
  return unique(`${task.title} ${task.description}`.toLowerCase().split(/[^a-z0-9]+/)).filter(
    (word) => word.length >= 4 && word !== "task" && word !== "test"
  );
}

function lexicalTokens(value: string): readonly string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((token) => token.length >= 3);
}

function rankSummaries(
  summaries: readonly FileSummary[],
  keywords: readonly string[]
): readonly string[] {
  if (keywords.length === 0 || summaries.length === 0) return [];
  const documents = summaries.map((summary) => ({
    path: summary.path,
    tokens: lexicalTokens(
      [
        summary.path,
        ...summary.symbols,
        ...summary.exports,
        ...summary.imports,
        ...summary.comments
      ].join(" ")
    )
  }));
  const averageLength =
    documents.reduce((sum, document) => sum + document.tokens.length, 0) /
    Math.max(1, documents.length);
  const documentFrequency = new Map<string, number>();
  for (const keyword of keywords) {
    documentFrequency.set(
      keyword,
      documents.filter((document) => document.tokens.includes(keyword)).length
    );
  }

  return documents
    .map((document) => {
      let score = 0;
      for (const keyword of keywords) {
        const frequency = document.tokens.filter((token) => token === keyword).length;
        if (frequency === 0) continue;
        const df = documentFrequency.get(keyword) ?? 0;
        const idf = Math.log(1 + (documents.length - df + 0.5) / (df + 0.5));
        const normalized =
          frequency +
          1.2 * (1 - 0.75 + (0.75 * document.tokens.length) / Math.max(1, averageLength));
        score += (idf * (frequency * 2.2)) / normalized;
        if (document.path.toLowerCase().includes(keyword)) score += idf * 2;
      }
      return { path: document.path, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path))
    .map((entry) => entry.path);
}

function compactText(text: string | undefined, maxLines: number): string {
  if (text === undefined) return "";

  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .join("\n");
}

function byId<T extends { readonly id: string }>(items: readonly T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

function acceptanceCriteriaForRequirements(
  requirements: readonly Requirement[],
  spec: SpecArtifact | undefined
): readonly AcceptanceCriterion[] {
  const topLevel = spec?.acceptanceCriteria ?? [];
  const all = [
    ...topLevel,
    ...requirements.flatMap((requirement) => requirement.acceptanceCriteria)
  ];
  const seen = new Set<string>();

  return all.filter((criterion) => {
    if (seen.has(criterion.id)) return false;
    seen.add(criterion.id);
    return requirements.some((requirement) => requirement.id === criterion.requirementId);
  });
}

function selectRequirements(input: {
  readonly task: Task;
  readonly spec?: SpecArtifact;
  readonly warnings: string[];
}): readonly Requirement[] {
  if (input.spec === undefined) {
    if (input.task.requirementIds.length > 0) {
      input.warnings.push("Spec artifact is missing; requirement details could not be included.");
    }
    return [];
  }

  const requirementsById = byId(input.spec.requirements);
  const requirements = input.task.requirementIds
    .map((id) => {
      const requirement = requirementsById.get(id);
      if (requirement === undefined) {
        input.warnings.push(`Task references missing requirement ${id}.`);
      }
      return requirement;
    })
    .filter((requirement): requirement is Requirement => requirement !== undefined);

  if (input.task.requirementIds.length === 0) {
    input.warnings.push(
      "Selected task does not reference requirements; included only minimal feature context."
    );
  }

  return requirements;
}

function selectAcceptanceCriteria(input: {
  readonly task: Task;
  readonly requirements: readonly Requirement[];
  readonly spec?: SpecArtifact;
  readonly warnings: string[];
}): readonly AcceptanceCriterion[] {
  if (input.spec === undefined) return [];

  const criteria = acceptanceCriteriaForRequirements(input.requirements, input.spec);
  const criteriaById = byId(criteria);

  if (input.task.acceptanceCriterionIds.length === 0 && input.requirements.length > 0) {
    input.warnings.push(
      "Task does not explicitly map acceptance criteria; included criteria from referenced requirements."
    );
    return criteria;
  }

  return input.task.acceptanceCriterionIds
    .map((id) => {
      const criterion = criteriaById.get(id);
      if (criterion === undefined) {
        input.warnings.push(`Task references missing acceptance criterion ${id}.`);
      }
      return criterion;
    })
    .filter((criterion): criterion is AcceptanceCriterion => criterion !== undefined);
}

function selectPlanDecisions(
  plan: PlanDraftArtifact | undefined,
  requirementIds: readonly string[]
): ContextPack["includedPlanDecisions"] {
  if (plan === undefined) return [];
  const requirements = new Set(requirementIds);

  return plan.decisions
    .filter((decision) =>
      decision.requirementIds.some((requirementId) => requirements.has(requirementId))
    )
    .map((decision) => ({
      id: decision.id,
      title: decision.title,
      summary: `${decision.decision} ${decision.reason}`.trim(),
      requirementIds: decision.requirementIds
    }));
}

function selectPlanRisks(
  plan: PlanDraftArtifact | undefined,
  requirementIds: readonly string[]
): ContextPack["includedRisks"] {
  if (plan === undefined) return [];
  const requirements = new Set(requirementIds);

  return plan.risks
    .filter((risk) => risk.requirementIds.some((requirementId) => requirements.has(requirementId)))
    .map((risk) => ({
      id: risk.id,
      description: risk.description,
      level: risk.level,
      mitigation: risk.mitigation,
      requirementIds: risk.requirementIds
    }));
}

function selectDependencyTasks(
  taskGraph: TaskGraphArtifact,
  task: Task
): ContextPack["includedDependencyTasks"] {
  const tasksById = new Map(taskGraph.tasks.map((candidate) => [candidate.id, candidate]));

  return task.dependsOn
    .map((dependencyId) => tasksById.get(dependencyId))
    .filter((dependency): dependency is Task => dependency !== undefined)
    .map((dependency) => ({
      id: dependency.id,
      title: dependency.title,
      status: dependency.status,
      dependsOn: dependency.dependsOn
    }));
}

function parseCompactRules(text: string | undefined): ContextPack["includedConstitutionRules"] {
  if (text === undefined) {
    return [
      {
        id: "C-FALLBACK",
        text: "Compact constitution is missing; keep changes scoped, tested, and token-efficient."
      }
    ];
  }

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = /^([A-Za-z0-9._:-]+):\s*(.+)$/.exec(line);
      return match === null ? undefined : { id: match[1] ?? "C-UNKNOWN", text: match[2] ?? line };
    })
    .filter((rule): rule is ContextPack["includedConstitutionRules"][number] => rule !== undefined)
    .filter((rule) =>
      /token|task|scope|test|dependency|function|structure|convention|trace/i.test(rule.text)
    );
}

function validationCommands(input: {
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly projectProfile?: ProjectProfile;
  readonly warnings: string[];
}): readonly string[] {
  const taskCommands = input.task.validationCommands.filter(
    (command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD"
  );
  const planCommands =
    input.plan?.testingStrategy
      .map((item) => item.validationCommand)
      .filter((command) => command.trim().length > 0 && command.trim().toUpperCase() !== "TBD") ??
    [];
  const projectCommands = [
    ...(input.projectProfile?.testCommands ?? []),
    ...(input.projectProfile?.typecheckCommands ?? []),
    ...(input.projectProfile?.buildCommands ?? [])
  ];
  const commands = unique([...taskCommands, ...planCommands, ...projectCommands]);

  if (commands.length === 0) {
    input.warnings.push("No concrete validation commands were available for this task.");
  }

  return commands;
}

/**
 * What `candidateFiles` chose, and which of those choices are load-bearing
 * enough to anchor a structural expansion.
 *
 * `paths` is unchanged in every branch — this split adds a second reading of
 * the same decision, not a new decision. `seeds` exists because "the files this
 * task is about" and "the files worth showing" are different questions: a
 * declared `allowedFiles` list is a statement by whoever wrote the task, while
 * the twelfth lexical hit is a guess, and only the first kind should decide
 * where a graph walk starts.
 */
type CandidateSelection = {
  readonly paths: readonly string[];
  readonly seeds: readonly string[];
};

function candidateFiles(input: {
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly summaries: readonly FileSummary[];
  readonly index: readonly FileIndexEntry[];
  readonly warnings: string[];
}): CandidateSelection {
  const direct = unique([...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])]);
  const concreteDirect = direct.filter((filePath) => filePath.toUpperCase() !== "TBD");

  if (concreteDirect.length > 0) {
    // Declared by a human or a planner about THIS task: every one of them is a
    // seed, not just the first three.
    return { paths: concreteDirect, seeds: concreteDirect };
  }

  const affected = unique(
    input.plan?.affectedModules
      .map((module) => module.moduleOrFileArea)
      .filter((filePath) => filePath.toUpperCase() !== "TBD") ?? []
  );

  if (affected.length > 0) {
    input.warnings.push("Task has no allowedFiles; used plan affected modules as file hints.");
    return { paths: affected, seeds: affected.slice(0, STRUCT_MAX_LEXICAL_SEEDS) };
  }

  const keywords = taskKeywords(input.task);
  const matched = rankSummaries(input.summaries, keywords);

  if (matched.length > 0) {
    input.warnings.push("Task has no allowedFiles; used ranked lexical symbol and path retrieval.");
    return { paths: matched, seeds: matched.slice(0, STRUCT_MAX_LEXICAL_SEEDS) };
  }

  if (/test|spec/i.test(input.task.title)) {
    const tests = input.index.filter((file) => file.isTestFile).map((file) => file.path);
    if (tests.length > 0) {
      input.warnings.push("Task looks test-related; selected existing test files.");
      // Every test file in the repository, in path order. Nothing here ranked
      // them, so the first three are alphabetical rather than relevant, and
      // seeding a graph walk from an alphabetical accident is how a bounded
      // mechanism starts producing confident noise.
      return { paths: tests, seeds: [] };
    }
  }

  input.warnings.push(
    "No allowed files declared for this task. Keep changes minimal and ask for clarification if needed."
  );

  const fallback = direct.length > 0 ? direct : [];

  return { paths: fallback, seeds: fallback };
}

function fileSummaryText(summary: FileSummary | undefined): string {
  if (summary === undefined) return "";

  return JSON.stringify(
    {
      language: summary.language,
      lineCount: summary.lineCount,
      imports: summary.imports,
      exports: summary.exports,
      symbols: summary.symbols,
      comments: summary.comments,
      skipped: summary.summarySkippedReason
    },
    null,
    2
  );
}

/**
 * Candidate order under a cited path: path members first, then the path's own
 * files the ranking missed, then everything the ranking chose, in its order.
 *
 * Nothing is removed. `candidates` is exactly the list the pack would carry
 * with no case at all, so this is a re-ranking with a bounded addition.
 */
function orderByPathMembership(input: {
  readonly candidates: readonly string[];
  readonly onPath: ReadonlySet<string>;
  readonly isEligible: (filePath: string) => boolean;
}): readonly string[] {
  // No case, or a case whose scout established nothing: there is no path to
  // rank by, so the candidate list is returned exactly as it arrived. This is
  // the same answer the previous `onPath === undefined` guard gave, and the
  // same answer this function already gave for an empty set.
  if (input.onPath.size === 0) return input.candidates;

  const onPath = input.onPath;
  const selected = new Set(input.candidates);
  const pathOnly = [...onPath]
    .map((filePath) => filePath.replaceAll("\\", "/"))
    .filter((filePath) => !selected.has(filePath) && input.isEligible(filePath))
    .sort()
    .slice(0, COMPACT_MAX_PATH_ONLY_FILES);

  return [
    ...input.candidates.filter((filePath) => onPath.has(filePath)),
    ...pathOnly,
    ...input.candidates.filter((filePath) => !onPath.has(filePath))
  ];
}

/**
 * Bounded structural admission: at most `STRUCT_MAX_ADMITTED_FILES` eligible
 * files one import or test hop from what the task already touches, which the
 * lexical ranking did not choose.
 *
 * APPENDED, never inserted and never substituted. The candidate list arrives
 * here already capped at `policy.maxFiles` and already re-ranked by path
 * membership; this function returns that exact list with up to two paths on the
 * end. So `ordered` is a prefix of the result, which is the strongest possible
 * form of "the graph cannot take a body away" — not merely a superset, an
 * order-preserving one, so nothing downstream that reads position sees a
 * different answer for any file that was already there.
 *
 * Ordering among the admitted files is by proximity and then by code point.
 * Every hop-1 file scores the same 0.5, so in practice the tie-break decides,
 * and it is deliberately a property of the path rather than anything cleverer:
 * a better tie-break is a ranking decision that should be measured on a fixture
 * before it is bought, not invented here.
 */
function admitStructuralCandidates(input: {
  readonly ordered: readonly string[];
  readonly proximity: ReadonlyMap<string, number> | undefined;
  readonly isEligible: (filePath: string) => boolean;
}): { readonly ordered: readonly string[]; readonly admitted: ReadonlySet<string> } {
  if (input.proximity === undefined || input.proximity.size === 0) {
    return { ordered: input.ordered, admitted: new Set() };
  }

  const selected = new Set(input.ordered);
  const admitted = [...input.proximity.entries()]
    .filter(
      ([filePath, score]) =>
        score >= STRUCT_MIN_ADMISSION_PROXIMITY &&
        !selected.has(filePath) &&
        input.isEligible(filePath)
    )
    .sort(([leftPath, leftScore], [rightPath, rightScore]) =>
      rightScore === leftScore ? compareByCodepoint(leftPath, rightPath) : rightScore - leftScore
    )
    .slice(0, STRUCT_MAX_ADMITTED_FILES)
    .map(([filePath]) => filePath);

  return { ordered: [...input.ordered, ...admitted], admitted: new Set(admitted) };
}

/**
 * Which files get the expensive body.
 *
 * Uncapped this is every candidate, exactly as before. Under the cap, three
 * claims in priority order:
 *
 *  1. a candidate scan could not summarise has no cheap body, so a snippet is
 *     the only thing standing between it and a bare filename — it is never
 *     silenced, and it does not spend the ranked budget;
 *  2. entities on the cited path are the highest-confidence content and take
 *     the budget first, up to the floor;
 *  3. the rest of the budget fills by relevance rank, which is the selection
 *     that scored 0.483 before any of this existed.
 *
 * WHAT DECIDES IS THE CAP, NOT THE CASE. This used to branch on whether an
 * understanding case existed, which made the cap unreachable without one and
 * tied the largest measured saving in the project to a mechanism that had
 * nothing to do with it. `onPath` is now free to be empty: rule 2 then
 * contributes nothing, `fromPath` stays 0, and rule 3 fills the whole cap by
 * relevance rank. That is exactly the arm F configuration.
 */
function allocateSnippets(input: {
  readonly ordered: readonly string[];
  readonly capped: boolean;
  readonly onPath: ReadonlySet<string>;
  readonly policy: ContextBudgetPolicy;
  readonly hasCheapBody: (filePath: string) => boolean;
}): ReadonlySet<string> {
  if (!input.capped) {
    return new Set(input.ordered.slice(0, input.policy.maxFiles));
  }

  const onPath = input.onPath;
  const chosen = new Set(input.ordered.filter((filePath) => !input.hasCheapBody(filePath)));
  let fromPath = 0;

  for (const filePath of input.ordered) {
    if (fromPath >= COMPACT_PATH_SNIPPET_BUDGET) break;
    if (chosen.has(filePath) || !onPath.has(filePath)) continue;
    chosen.add(filePath);
    fromPath += 1;
  }

  let fromRanking = 0;

  for (const filePath of input.ordered) {
    if (fromRanking >= COMPACT_MAX_SNIPPET_FILES - fromPath) break;
    if (chosen.has(filePath)) continue;
    chosen.add(filePath);
    fromRanking += 1;
  }

  return chosen;
}

/**
 * Why this file got the expensive body, as the pack states it.
 *
 * The fourth case is new, and it is the one place this change is deliberately
 * NOT bit-identical to the measurement build. That build made `onPath` an
 * empty set, so every capped snippet with no case reported "Highest-ranked file
 * off the cited path" — a sentence about a cited path that does not exist. The
 * pack is an artifact somebody scores from, so it says what is true instead,
 * at a cost of roughly one token per snippet and at most four snippets, which
 * is the disclosed difference between this configuration and arm F's numbers.
 */
function snippetReason(input: {
  readonly capped: boolean;
  readonly onPath: ReadonlySet<string>;
  readonly filePath: string;
}): string {
  if (!input.capped) return "Task file context.";
  if (input.onPath.has(input.filePath)) return "Entity on the cited path.";

  return input.onPath.size > 0
    ? "Highest-ranked file off the cited path."
    : "Highest-ranked file within the snippet cap.";
}

async function buildFileContexts(input: {
  readonly targetPath: string;
  readonly policy: ContextBudgetPolicy;
  readonly includeFullFiles: boolean;
  readonly task: Task;
  readonly plan?: PlanDraftArtifact;
  readonly fileIndex: readonly FileIndexEntry[];
  readonly fileSummaries: readonly FileSummary[];
  readonly understanding?: ContextUnderstanding;
  readonly fileGraph?: IntelFileGraph;
  readonly warnings: string[];
}): Promise<readonly FileContext[]> {
  const indexByPath = new Map(input.fileIndex.map((file) => [file.path, file]));
  const summariesByPath = new Map(input.fileSummaries.map((summary) => [summary.path, summary]));
  const selection = candidateFiles({
    task: input.task,
    plan: input.plan,
    summaries: input.fileSummaries,
    index: input.fileIndex,
    warnings: input.warnings
  });
  const candidates = selection.paths.slice(0, input.policy.maxFiles);
  const forbidden = new Set(input.task.forbiddenFiles ?? []);
  // Two INDEPENDENT inputs, and keeping them independent is the whole change.
  //
  //   `onPath` — which files a case cites. Empty when there is no case: an
  //   absent case cites no files, and that is exactly what the empty set says.
  //   It is a ranking signal, and nothing below reads it as a switch.
  //
  //   `capped` — whether the compact snippet cap applies. Resolved from the
  //   budget policy, which resolves it from the CLI flag, then `.visp/config`,
  //   then the per-mode default.
  //
  // A fake empty case would have coupled them again by another route, and it
  // would have put `understanding: {}` in the pack, in the artifact
  // provenance, and in front of every gate that asks whether a case exists.
  const onPath =
    input.understanding === undefined
      ? EMPTY_PATH_SET
      : understandingFilePaths(input.understanding);
  const capped = input.policy.compactSnippetCap;
  const isEligible = (filePath: string): boolean =>
    !forbidden.has(filePath) &&
    !shouldIgnorePath(filePath) &&
    !isBinaryPath(filePath) &&
    (!isLockFile(filePath) || /dependency|package/i.test(input.task.title)) &&
    indexByPath.has(filePath);
  const paths = orderByPathMembership({
    candidates: [...new Set(candidates.map((filePath) => filePath.replaceAll("\\", "/")))],
    onPath,
    isEligible
  });
  // Seeds: what the task already touches. The declared or ranked files it is
  // about, plus every file the understanding case's path and signatures name.
  // Both are things Kit already had; the graph only says what is next to them.
  //
  // Normalised harder than `candidates` above, and only here. Intel's paths
  // have had `./` stripped, so a task that declared `./src/a.ts` would seed the
  // walk with a string no edge in the graph carries. Applying the same
  // normalisation to `candidates` would be a real improvement and a change to
  // what every pack contains with no graph present at all, which is not this
  // seam's to make.
  const seeds = new Set(
    [...selection.seeds, ...onPath].map(normalizeRepositoryPath).filter((f) => f.length > 0)
  );
  const proximity =
    input.fileGraph === undefined
      ? undefined
      : structuralProximity({ seeds, fileGraph: input.fileGraph });
  const structural = admitStructuralCandidates({ ordered: paths, proximity, isEligible });
  const orderedPaths = structural.ordered;
  const snippetPaths = allocateSnippets({
    // Structure-admitted files are withheld from snippet allocation entirely,
    // so `allocateSnippets` is handed exactly the list it would have been
    // handed with no graph, and the reserved relevance floor and the path
    // budget are arithmetically untouched. Structure buys summaries; it does
    // not compete for the expensive slots.
    ordered: orderedPaths.filter(
      (filePath) => isEligible(filePath) && !structural.admitted.has(filePath)
    ),
    capped,
    onPath,
    policy: input.policy,
    hasCheapBody: (filePath) => summariesByPath.has(filePath)
  });
  const contexts: FileContext[] = [];

  for (const normalized of orderedPaths) {
    if (
      forbidden.has(normalized) ||
      shouldIgnorePath(normalized) ||
      isBinaryPath(normalized) ||
      (isLockFile(normalized) && !/dependency|package/i.test(input.task.title))
    ) {
      input.warnings.push(`Skipped ignored or forbidden file context: ${normalized}.`);
      continue;
    }

    const indexEntry = indexByPath.get(normalized);
    const summary = summariesByPath.get(normalized);

    if (indexEntry === undefined) {
      contexts.push({
        file: {
          path: normalized,
          reason: "Task allowed or expected file is not present yet.",
          includeMode: "new-file",
          hash: "new-file",
          language: "unknown",
          sizeBytes: 0,
          tokenEstimate: 0,
          summaryAvailable: false,
          snippetIncluded: false,
          warning: "Expected new file or file missing from scan cache."
        }
      });
      continue;
    }

    // Every in-scope file keeps its summary. The bulk that put Visp at
    // 90-135k tokens against bare's 42k was the uncapped snippet, not this,
    // and withholding the summary is what cost -78.3% recall for -66.1%
    // tokens. Snippets are the budgeted resource; `snippetPaths` says who
    // earned one and why.
    const summaryText = fileSummaryText(summary);
    let snippet = snippetPaths.has(normalized)
      ? await extractFileSnippet({
          rootPath: input.targetPath,
          filePath: normalized,
          maxTokens: input.includeFullFiles
            ? input.policy.maxFullFileTokens
            : input.policy.maxSnippetTokensPerFile,
          fullFile: input.includeFullFiles && !capped,
          reason: snippetReason({ capped, onPath, filePath: normalized }),
          focusTerms: taskKeywords(input.task),
          ...(capped ? { maxLines: COMPACT_MAX_SNIPPET_LINES } : {})
        })
      : ({ ok: true, value: undefined } as const);
    let warning: string | undefined;
    let includeMode: FileContext["file"]["includeMode"] = "summary";

    if (!snippet.ok) {
      warning = snippet.error.message;
      snippet = { ok: true, value: undefined };
    }

    if (snippet.value !== undefined && input.includeFullFiles && !capped) {
      if (snippet.value.tokenEstimate <= input.policy.maxFullFileTokens) {
        includeMode = "full";
      } else {
        warning = "Full file exceeded file budget; included snippet instead.";
        snippet = await extractFileSnippet({
          rootPath: input.targetPath,
          filePath: normalized,
          maxTokens: input.policy.maxSnippetTokensPerFile,
          fullFile: false,
          reason: "Task file snippet after full-file fallback.",
          focusTerms: taskKeywords(input.task)
        });
        includeMode = snippet.ok && snippet.value !== undefined ? "snippet" : "summary";
      }
    } else if (snippet.value !== undefined) {
      includeMode = "snippet";
    }

    const contextSnippet =
      snippet.ok && snippet.value !== undefined
        ? {
            filePath: snippet.value.filePath,
            reason: snippet.value.reason,
            startLine: snippet.value.startLine,
            endLine: snippet.value.endLine,
            content: snippet.value.content,
            tokenEstimate: snippet.value.tokenEstimate
          }
        : undefined;

    contexts.push({
      file: {
        path: normalized,
        reason: input.task.allowedFiles.includes(normalized)
          ? "Task allowed file."
          : onPath.has(normalized)
            ? "Entity on the cited path."
            : structural.admitted.has(normalized)
              ? "One import or test hop from a file this task touches."
              : "Task expected or related file.",
        includeMode,
        hash: indexEntry.hash,
        language: indexEntry.language,
        sizeBytes: indexEntry.sizeBytes,
        tokenEstimate: estimateTokens(summaryText) + (contextSnippet?.tokenEstimate ?? 0),
        summaryAvailable: summary !== undefined,
        snippetIncluded: contextSnippet !== undefined,
        summary: summaryText,
        warning
      },
      snippet: contextSnippet
    });
  }

  return contexts;
}

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
  // alongside it, and the arm F pack that produced -52.01% carried both of
  // them. Folding them in here would ship a configuration nobody ran under a
  // number somebody did. Read that -52.01% narrowly: bodied recall held because
  // the capped pack named the same files, and bodied recall equals listed
  // recall in that harness (a file counts as bodied on a non-empty summary, and
  // Kit summarises everything it lists) — it is the same file list for half the
  // tokens, not the same information, and it was balanced mode on two
  // repositories against a visp-dev measurement build.
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
