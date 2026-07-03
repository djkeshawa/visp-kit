import { type FeatureTimeline } from "../artifacts/schemas/timeline.schema.js";

export function renderTimelineMarkdown(timeline: FeatureTimeline): string {
  const lines = [
    `# Feature Timeline: ${timeline.featureId}-${timeline.featureSlug}`,
    "",
    "## Summary",
    "",
    `- Generated: ${timeline.generatedAt}`,
    `- Tasks: ${timeline.completedTaskCount}/${timeline.taskCount} complete`,
    `- Estimated tokens: ${timeline.estimatedTokens ?? "unknown"}`,
    `- Actual tokens: ${timeline.actualTokens ?? "unknown"}`,
    `- Open blockers: ${timeline.openBlockers.length}`,
    "",
    "## Events",
    ""
  ];

  if (timeline.events.length === 0) {
    lines.push("- No timeline events available.");
  } else {
    lines.push(
      ...timeline.events.map(
        (event) =>
          `- ${event.createdAt ?? "unknown"} ${event.kind}: ${event.title} (${event.status})${event.taskId === undefined ? "" : ` [${event.taskId}]`}`
      )
    );
  }

  if (timeline.openBlockers.length > 0) {
    lines.push("", "## Open Blockers", "", ...timeline.openBlockers.map((item) => `- ${item}`));
  }

  return `${lines.join("\n")}\n`;
}
