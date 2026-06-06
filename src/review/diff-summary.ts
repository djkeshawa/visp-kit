import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";

import { isDependencyFile as isKnownDependencyFile } from "../dependencies/dependency-files.js";

export function normalizeReviewPath(value: string): string {
  return value.replaceAll("\\", "/").trim();
}

export function isDependencyFile(filePath: string): boolean {
  return isKnownDependencyFile(normalizeReviewPath(filePath));
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath).toLowerCase();

  return /(^|\/)(tests?|__tests__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized) ||
    /_test\.go$/.test(normalized) ||
    /(?:test|tests)\.java$/.test(normalized) ||
    /(^|\/)test_[^/]+\.py$/.test(normalized) ||
    /_test\.py$/.test(normalized) ||
    /_test\.rs$/.test(normalized);
}

export function isGeneratedVispReviewFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath);

  return normalized.startsWith(".visp/reports/") ||
    normalized.startsWith(".visp/cache/") ||
    normalized.startsWith(".visp/runs/") ||
    normalized.startsWith(".visp/agent/") ||
    normalized.startsWith(".visp/presets/") ||
    normalized === ".visp/status.json" ||
    normalized === ".visp/project.json" ||
    normalized === ".visp/budget.json" ||
    normalized === ".visp/workflow.json" ||
    normalized === ".visp/memory/patterns.md" ||
    normalized === ".visp/memory/project-summary.md" ||
    /^\.visp\/prompts\/.+\.prompt\.md$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/timeline\.(json|md)$/.test(normalized) ||
    normalized === ".visp/prompts/review.prompt.md" ||
    normalized === ".visp/prompts/reconcile.prompt.md" ||
    /^\.visp\/features\/[^/]+\/context\/[^/]+\.implementation-checklist\.(json|md)$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/review\//.test(normalized) ||
    /^\.visp\/features\/[^/]+\/review\.(json|md)$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/review-(prompt|checklist)\.md$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/reconcile\//.test(normalized) ||
    /^\.visp\/features\/[^/]+\/reconcile\.(json|md)$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/reconcile-prompt\.md$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/verification\.(json|md)$/.test(normalized);
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
