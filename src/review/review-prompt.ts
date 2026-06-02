import { type ReviewReport } from "../artifacts/schemas/review.schema.js";

function list(values: readonly string[], empty = "- none"): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

export function renderReviewPrompt(input: {
  readonly report: ReviewReport;
  readonly taskTitle?: string;
  readonly contextPath?: string | null;
  readonly verificationPath?: string | null;
  readonly reviewReportPath?: string | null;
}): string {
  const blocking = input.report.findings
    .filter((finding) => finding.severity === "error")
    .map((finding) => `${finding.id}: ${finding.title}`);
  const warnings = input.report.findings
    .filter((finding) => finding.severity === "warning")
    .map((finding) => `${finding.id}: ${finding.title}`);

  return `# Visp Diff Review Prompt

You are reviewing one Visp Kit ${input.report.taskId === null ? "feature" : "task"}.

Feature:
${input.report.featureId}-${input.report.featureSlug}

Task:
${input.report.taskId === null ? "feature-level review" : `${input.report.taskId} - ${input.taskTitle ?? "Untitled task"}`}

Read:
${list([
  input.contextPath,
  input.verificationPath,
  input.reviewReportPath
].filter((value): value is string => Boolean(value)))}

Review focus:
- Check whether the implementation satisfies the selected task only.
- Check whether requirements and acceptance criteria are covered.
- Check whether the diff stays within allowed files.
- Check whether tests are sufficient.
- Check whether dependency changes are justified.
- Check security/privacy risks listed in the review checklist.
- Do not implement code unless explicitly asked.
- Do not review unrelated files.
- Keep feedback concise and actionable.

Changed files:
${list(input.report.changedFiles.map((file) => `${file.path} (${file.changeType}, +${file.additions}/-${file.deletions})`))}

Blocking findings:
${list(blocking)}

Warnings:
${list(warnings)}

After review:
- summarize blocking issues
- summarize non-blocking suggestions
- recommend whether to proceed to reconcile

Do not include huge raw diffs unless explicitly requested. Use the review report and context pack paths above.
`;
}
