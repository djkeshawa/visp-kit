import { writeFeatureTimeline } from "../../timeline/timeline-builder.js";

export type TimelineRefreshResult = {
  readonly writtenFiles: readonly string[];
  readonly warnings: readonly string[];
};

export async function refreshFeatureTimeline(input: {
  readonly targetPath: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly dryRun: boolean;
  readonly now: string;
}): Promise<TimelineRefreshResult> {
  const result = await writeFeatureTimeline(input);

  if (!result.ok) {
    return {
      writtenFiles: [],
      warnings: [`Timeline refresh skipped: ${result.error.message}`]
    };
  }

  return result.value;
}
