import { type ReviewChangedFile } from "../artifacts/schemas/review.schema.js";

const dependencyFiles = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json"
]);

export function normalizeReviewPath(value: string): string {
  return value.replaceAll("\\", "/").trim();
}

export function isDependencyFile(filePath: string): boolean {
  return dependencyFiles.has(normalizeReviewPath(filePath));
}

export function isTestFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath).toLowerCase();

  return /(^|\/)(tests?|__tests__)\//.test(normalized) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(normalized);
}

export function isGeneratedVispReviewFile(filePath: string): boolean {
  const normalized = normalizeReviewPath(filePath);

  return normalized.startsWith(".visp/reports/") ||
    normalized === ".visp/prompts/review.prompt.md" ||
    /^\.visp\/features\/[^/]+\/review\//.test(normalized) ||
    /^\.visp\/features\/[^/]+\/review\.(json|md)$/.test(normalized) ||
    /^\.visp\/features\/[^/]+\/review-(prompt|checklist)\.md$/.test(normalized) ||
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
