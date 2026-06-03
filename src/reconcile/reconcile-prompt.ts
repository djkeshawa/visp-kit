import { type ReconcileReport } from "../artifacts/schemas/reconcile.schema.js";

function list(values: readonly string[], empty = "- none"): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

export function renderReconcilePrompt(input: {
  readonly report: ReconcileReport;
  readonly taskTitle?: string;
  readonly paths: readonly (string | null | undefined)[];
}): string {
  return `# Visp Reconcile Prompt

You are reconciling one Visp Kit ${input.report.taskId === null ? "feature" : "task"} after implementation.

Feature:
${input.report.featureId}-${input.report.featureSlug}

Task:
${input.report.taskId === null ? "feature-level reconciliation" : `${input.report.taskId} - ${input.taskTitle ?? "Untitled task"}`}

Read:
${list(input.paths.filter((value): value is string => Boolean(value)))}

Focus:
- Confirm whether the implementation matches the task.
- Confirm whether requirements and acceptance criteria are covered.
- Confirm whether changed files are mapped.
- Identify spec-code drift.
- Identify follow-up work.
- Do not modify implementation code unless explicitly asked.
- Do not implement new features.
- Keep feedback concise and actionable.

Known reconciliation findings:
${list(input.report.findings.map((finding) => `${finding.id}: ${finding.title}`))}

Recommended next action:
${input.report.nextCommand}

Do not inline huge diffs in the prompt. Reference report paths instead.
`;
}
