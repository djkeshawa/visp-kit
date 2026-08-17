import { type ReviewReport } from "../artifacts/schemas/review.schema.js";

/**
 * What to run after a review, including — crucially — after one that failed.
 *
 * LC-131: a failed review answered `visp-kit verify`, verify passed, and the
 * loop closed. On an empty working-tree scope it was worse: `visp-kit done`
 * printed `visp-kit review --task <id>`, which reproduces the same output
 * forever. Neither command changes what the review can see, so neither can
 * clear the failure.
 *
 * The empty-scope case has exactly one repair — point the review at the range
 * the work is actually in — and the finding has said so since LC-106. This is
 * where that advice becomes the command the workflow prints.
 */
export function reviewNextCommand(
  report: Pick<ReviewReport, "result" | "taskId" | "scopeBasis">
): string {
  const taskSuffix = report.taskId === null ? "" : ` --task ${report.taskId}`;

  if (report.result !== "failed") return `visp-kit reconcile${taskSuffix}`;

  if (report.scopeBasis?.empty === true && report.scopeBasis.kind === "working-tree") {
    return `visp-kit review${taskSuffix} --base <git-ref>`;
  }

  return `visp-kit verify${taskSuffix}`;
}

/**
 * The recovery `visp-kit done` reports for its review step: the blocking
 * finding's own recommendation, which is the only text in the system that knows
 * why this particular review failed. `done` used to hard-code
 * `visp-kit review --task <id>` for every failure, which is the loop above.
 */
export function reviewFailureRecovery(input: {
  readonly findings: readonly {
    readonly severity: string;
    readonly recommendation: string;
  }[];
  readonly fallbackCommand: string;
}): string {
  const blocking = input.findings.find((finding) => finding.severity === "error");

  return blocking === undefined ? input.fallbackCommand : blocking.recommendation;
}
