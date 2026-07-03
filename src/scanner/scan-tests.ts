import path from "node:path";

import { type FileIndexEntry } from "./types.js";

export type TestMapEntry = {
  readonly path: string;
  readonly likelyTargetPath: string | null;
};

export type TestMap = {
  readonly generatedAt: string;
  readonly testFrameworks: readonly string[];
  readonly testRoots: readonly string[];
  readonly testFiles: readonly TestMapEntry[];
  readonly testCommandCandidates: readonly string[];
};

function sourceNameForTest(testPath: string): string {
  return path
    .basename(testPath)
    .replace(/\.(?:test|spec)\./, ".")
    .replace(/\.(tsx|jsx)$/, ".ts");
}

function inferTarget(testPath: string, sourceFiles: readonly FileIndexEntry[]): string | null {
  const sourceName = sourceNameForTest(testPath);
  const sameDirectory = testPath.replace(/\.(?:test|spec)\./, ".");
  const direct = sourceFiles.find((file) => file.path === sameDirectory);

  if (direct !== undefined) {
    return direct.path;
  }

  return sourceFiles.find((file) => path.basename(file.path) === sourceName)?.path ?? null;
}

export function buildTestMap(input: {
  readonly files: readonly FileIndexEntry[];
  readonly testFrameworks: readonly string[];
  readonly testRoots: readonly string[];
  readonly testCommands: readonly string[];
  readonly generatedAt: string;
}): TestMap {
  const sourceFiles = input.files.filter((file) => !file.isTestFile);
  const testFiles = input.files
    .filter((file) => file.isTestFile)
    .map((file) => ({
      path: file.path,
      likelyTargetPath: inferTarget(file.path, sourceFiles)
    }))
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    generatedAt: input.generatedAt,
    testFrameworks: input.testFrameworks,
    testRoots: input.testRoots,
    testFiles,
    testCommandCandidates: input.testCommands
  };
}
