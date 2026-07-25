import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";
import { idSchema } from "../artifacts/schemas/common.schema.js";

import { isDependencyFile as isKnownDependencyFile } from "../dependencies/dependency-files.js";

export function normalizeReviewPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function isDependencyFile(filePath: string): boolean {
  return isKnownDependencyFile(filePath);
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath).toLowerCase();

  return (
    /(^|\/)(tests?|__tests__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /_test\.go$/.test(normalized) ||
    /(?:test|tests)\.java$/.test(normalized) ||
    /(^|\/)test_[^/]+\.py$/.test(normalized) ||
    /_test\.py$/.test(normalized) ||
    /_test\.rs$/.test(normalized)
  );
}

export function isGeneratedVispReviewFile(filePath: string): boolean {
  const taskMarker = /^\.visp\/state\/implement-allowed\/([^/]+)\.json$/.exec(filePath);
  const isImplementMarker =
    filePath === ".visp/state/implement-allowed.json" ||
    (taskMarker !== null && idSchema.safeParse(taskMarker[1]).success);

  return (
    isImplementMarker ||
    filePath.startsWith(".visp/reports/") ||
    filePath.startsWith(".visp/cache/") ||
    filePath.startsWith(".visp/runs/") ||
    filePath.startsWith(".visp/agent/") ||
    filePath.startsWith(".visp/presets/") ||
    filePath === ".visp/status.json" ||
    filePath === ".visp/project.json" ||
    filePath === ".visp/budget.json" ||
    filePath === ".visp/workflow.json" ||
    filePath === ".visp/memory/patterns.md" ||
    filePath === ".visp/memory/project-summary.md" ||
    /^\.visp\/prompts\/.+\.prompt\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/timeline\.(json|md)$/.test(filePath) ||
    filePath === ".visp/prompts/review.prompt.md" ||
    filePath === ".visp/prompts/reconcile.prompt.md" ||
    /^\.visp\/features\/[^/]+\/context\/[^/]+\.implementation-checklist\.(json|md)$/.test(
      filePath
    ) ||
    /^\.visp\/features\/[^/]+\/review\//.test(filePath) ||
    /^\.visp\/features\/[^/]+\/review\.(json|md)$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/review-(prompt|checklist)\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile\//.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile\.(json|md)$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/reconcile-prompt\.md$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/verification\.(json|md)$/.test(filePath) ||
    /^\.visp\/features\/[^/]+\/assurance\/[^/]+\/(?:.+\/)?[^/]+\.(json|md)$/.test(filePath)
  );
}

export function summarizeDiff(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly diffSource: string;
  readonly baseRef?: string | null;
}): {
  readonly filesChanged: number;
  readonly additions: number;
  readonly deletions: number;
  readonly truncatedFiles: number;
  readonly totalDiffTruncated: boolean;
  readonly diffSource: string;
  readonly baseRef: string | null;
} {
  return {
    filesChanged: input.changedFiles.length,
    additions: input.changedFiles.reduce((total, file) => total + file.additions, 0),
    deletions: input.changedFiles.reduce((total, file) => total + file.deletions, 0),
    truncatedFiles: input.changedFiles.filter((file) => file.diffTruncated).length,
    totalDiffTruncated: input.changedFiles.some((file) => file.diffTruncated),
    diffSource: input.diffSource,
    baseRef: input.baseRef ?? null
  };
}
