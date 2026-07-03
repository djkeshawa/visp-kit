import { fileSummariesArtifactPath } from "../artifacts/artifact-paths.js";
import { readPreviousSummaries } from "./cache.js";
import { summarizeFile } from "./file-summary.js";
import {
  type FileIndexEntry,
  type FileSummariesCache,
  type FileSummary,
  type ScanCounts
} from "./types.js";

export type SummaryBuildResult = {
  readonly cache: FileSummariesCache;
  readonly counts: ScanCounts;
  readonly deletedFiles: readonly string[];
  readonly changedFilePaths: readonly string[];
};

export async function buildFileSummaries(input: {
  readonly rootPath: string;
  readonly files: readonly FileIndexEntry[];
  readonly generatedAt: string;
  readonly force: boolean;
}): Promise<SummaryBuildResult> {
  const previous = await readPreviousSummaries(fileSummariesArtifactPath(input.rootPath));
  const currentPaths = new Set(input.files.map((file) => file.path));
  const deletedFiles = [...previous.keys()]
    .filter((filePath) => !currentPaths.has(filePath))
    .sort((a, b) => a.localeCompare(b));
  const summaries: FileSummary[] = [];
  let reusedSummaries = 0;
  let changedFiles = deletedFiles.length;

  for (const file of input.files) {
    const previousSummary = previous.get(file.path);

    if (previousSummary !== undefined && previousSummary.hash === file.hash && !input.force) {
      summaries.push(previousSummary);
      reusedSummaries += 1;
      continue;
    }

    summaries.push(await summarizeFile(input.rootPath, file));
    changedFiles += 1;
  }

  const changedFilePaths = summaries
    .filter((summary) => previous.get(summary.path)?.hash !== summary.hash)
    .map((summary) => summary.path)
    .sort((a, b) => a.localeCompare(b));

  return {
    cache: {
      generatedAt: input.generatedAt,
      items: summaries.sort((a, b) => a.path.localeCompare(b.path))
    },
    counts: {
      totalFiles: input.files.length,
      summarizedFiles: summaries.filter((summary) => summary.summarySkippedReason === undefined)
        .length,
      reusedSummaries,
      skippedFiles: summaries.filter((summary) => summary.summarySkippedReason !== undefined)
        .length,
      changedFiles,
      deletedFiles: deletedFiles.length
    },
    deletedFiles,
    changedFilePaths
  };
}
