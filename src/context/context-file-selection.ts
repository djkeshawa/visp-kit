/**
 * Choosing which files a context pack shows, and how much of each.
 *
 * Two different questions run in sequence. `candidateFiles` asks which files
 * the task is about — declared scope first, lexical guesses after — and
 * `admitStructuralCandidates` then asks which NEIGHBOURS of those are close
 * enough in the import graph to be worth the tokens. `allocateSnippets` spends
 * the remaining budget across the survivors.
 *
 * The order matters: a declared `allowedFiles` entry is a statement by whoever
 * wrote the task, a lexical hit is a guess, and only the first kind seeds the
 * graph walk.
 */
import { type ContextUnderstanding } from "../artifacts/schemas/context-pack.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { compareByCodepoint, normalizeRepositoryPath } from "../core/paths.js";
import { shouldIgnorePath, isBinaryPath, isLockFile } from "../scanner/ignore-rules.js";
import { type IntelFileGraph } from "../scanner/intel-graph.js";
import { type FileIndexEntry, type FileSummary } from "../scanner/types.js";
import { type ContextBudgetPolicy } from "./context-budget.js";
import { extractFileSnippet } from "./file-snippets.js";
import { structuralProximity } from "./structural-proximity.js";
import { estimateTokens } from "./token-estimator.js";
import { uniqueTrimmed as unique } from "../core/collections.js";
import {
  COMPACT_MAX_PATH_ONLY_FILES,
  COMPACT_MAX_SNIPPET_FILES,
  COMPACT_MAX_SNIPPET_LINES,
  COMPACT_PATH_SNIPPET_BUDGET,
  EMPTY_PATH_SET,
  type FileContext,
  STRUCT_MAX_ADMITTED_FILES,
  STRUCT_MAX_LEXICAL_SEEDS,
  STRUCT_MIN_ADMISSION_PROXIMITY,
  understandingFilePaths
} from "./context-selector-budget.js";
import { rankSummaries, taskKeywords } from "./context-artifact-selection.js";

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
export type CandidateSelection = {
  readonly paths: readonly string[];
  readonly seeds: readonly string[];
};

export function candidateFiles(input: {
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

export function fileSummaryText(summary: FileSummary | undefined): string {
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
export function orderByPathMembership(input: {
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
export function admitStructuralCandidates(input: {
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
export function allocateSnippets(input: {
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
export function snippetReason(input: {
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

export async function buildFileContexts(input: {
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
