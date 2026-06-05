import { type RunArtifact, type RunEvent } from "../artifacts/schemas/run.schema.js";

export function renderRunMarkdown(input: {
  readonly run: RunArtifact;
  readonly events: readonly RunEvent[];
}): string {
  const lines = [
    `# Visp Run: ${input.run.id}`,
    "",
    "## Summary",
    "",
    `- Command: ${input.run.command}`,
    `- Result: ${input.run.result}`,
    `- Success: ${input.run.success ? "yes" : "no"}`,
    `- Started: ${input.run.startedAt}`,
    `- Ended: ${input.run.endedAt}`,
    `- Duration: ${input.run.durationMs} ms`,
    `- Feature: ${input.run.featureId ?? "none"}`,
    `- Task: ${input.run.taskId ?? "none"}`,
    `- Estimated tokens: ${input.run.estimatedTokens ?? "unknown"}`,
    `- Actual tokens: ${input.run.actualTokens ?? "unknown"}`,
    "",
    "## Artifacts",
    "",
    ...(input.run.artifactWrites.length === 0
      ? ["- none"]
      : input.run.artifactWrites.map((item) => `- ${item}`)),
    "",
    "## Events",
    "",
    ...input.events.map((event) => `- ${event.createdAt} ${event.type}: ${event.message}`),
    ""
  ];

  if (input.run.warnings.length > 0) {
    lines.push("## Warnings", "", ...input.run.warnings.map((item) => `- ${item}`), "");
  }

  if (input.run.errors.length > 0) {
    lines.push("## Errors", "", ...input.run.errors.map((item) => `- ${item}`), "");
  }

  return `${lines.join("\n")}\n`;
}
