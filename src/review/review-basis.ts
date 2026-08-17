import {
  type ReviewChangedFile,
  type ReviewScopeBasis
} from "../artifacts/schemas/review.schema.js";
import { isGeneratedVispReviewFile } from "./diff-summary.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

/**
 * The stated contract for what `visp-kit review` looks at.
 *
 * **Working tree is the default basis**: unstaged changes, staged changes and
 * untracked files. Committed work is deliberately outside it — the diff loader
 * only reaches commits when `--base <ref>` is given, and then the basis becomes
 * the commit range `<base>...HEAD`.
 *
 * Naming this was the point of LC-106. Review had the same behaviour before,
 * but nowhere stated it, so an agent that committed its work first got a review
 * of an empty tree and a `passed` verdict — a review of nothing, reported as a
 * review that found nothing.
 */
const workingTreeGuidance =
  "Commit history is outside this basis; review committed work with `visp-kit review --base <git-ref>`.";

function describeBasis(input: {
  readonly baseRef: string | null;
  readonly diffSource: string;
}): string {
  if (input.baseRef !== null) {
    return `Commit range ${input.baseRef}...HEAD (git diff source: ${input.diffSource}).`;
  }

  return `Uncommitted working tree (git diff source: ${input.diffSource}). ${workingTreeGuidance}`;
}

/**
 * Whether a path is Visp's own output rather than something a human wrote.
 *
 * This is an *authorship* question, and it is not the same question as
 * `isExemptFromTaskScope`, which asks whether a path counts against a task's
 * declared file scope. The first version of this file reused the scope
 * predicate, which exempts `.gitignore` — correct for scope, wrong here, because
 * it made a task whose only legitimate change was `.gitignore` fail review as
 * having examined nothing.
 */
function isVispGeneratedPath(filePath: string): boolean {
  return filePath.startsWith(".visp/") || isGeneratedVispReviewFile(filePath);
}

/**
 * Files that could carry the author's work. Visp's own generated artifacts are
 * excluded, because a diff made up entirely of `.visp/` output means the review
 * saw none of the change it was asked to judge — the exact shape of the defect
 * that shipped eight green reviews of zero files.
 */
function reviewableFilePaths(files: readonly ReviewChangedFile[]): string[] {
  return files.filter((file) => !isVispGeneratedPath(file.path)).map((file) => file.path);
}

export function reviewScopeBasis(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly diffSource: string;
  readonly baseRef: string | null;
}): ReviewScopeBasis {
  const reviewableFiles = reviewableFilePaths(input.changedFiles);

  return {
    kind: input.baseRef === null ? "working-tree" : "base-range",
    description: describeBasis({
      baseRef: input.baseRef,
      diffSource: input.diffSource
    }),
    diffSource: input.diffSource,
    baseRef: input.baseRef,
    filesExamined: input.changedFiles.length,
    examinedFiles: input.changedFiles.map((file) => file.path),
    reviewableFiles,
    empty: reviewableFiles.length === 0
  };
}

export function emptyScopeMessage(basis: ReviewScopeBasis): string {
  return `Review examined no reviewable changes. ${basis.description} Files examined: ${basis.filesExamined}; reviewable: 0.`;
}

/**
 * An empty scope is a blocking finding, never a pass. A review that inspected
 * nothing has produced no evidence about the work, and reporting that as
 * `passed` is worse than reporting a failure — it fails green.
 */
export function emptyScopeFinding(input: {
  readonly basis: ReviewScopeBasis;
  readonly taskId?: string;
}): ReviewFindingDraft {
  return finding({
    category: "scope",
    severity: "error",
    title: "Review examined no reviewable changes",
    description:
      input.basis.kind === "working-tree"
        ? "The working tree contains no changes this review can judge, so this review is inconclusive rather than clean. Work that is already committed is not part of the working-tree basis."
        : `The commit range ${input.basis.baseRef ?? "<base>"}...HEAD contains no changes this review can judge, so this review is inconclusive rather than clean.`,
    evidence: emptyScopeMessage(input.basis),
    recommendation:
      input.basis.kind === "working-tree"
        ? "Re-run with `--base <git-ref>` if the work is committed, or make the task's changes before reviewing."
        : "Point `--base` at the ref the task branched from.",
    relatedTaskId: input.taskId ?? null
  });
}
