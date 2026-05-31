import {
  detectFrameworks,
  detectPackageManager,
  detectScriptCommands,
  readPackageJson
} from "./scan-package-json.js";
import { detectSourceRoots, detectTestRoots } from "./project-roots.js";
import { scanFiles } from "./scan-files.js";
import { summarizeLanguages } from "./language.js";
import { type FileIndexEntry, type ProjectDetection } from "./types.js";

const testFrameworkNames = new Set(["vitest", "jest", "playwright", "cypress"]);

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function lockFiles(files: readonly FileIndexEntry[]): string[] {
  const names = new Set(["pnpm-lock.yaml", "package-lock.json", "yarn.lock", "bun.lock", "bun.lockb"]);

  return files
    .map((file) => file.path)
    .filter((filePath) => names.has(filePath))
    .sort((a, b) => a.localeCompare(b));
}

export type ProjectScanInput = {
  readonly rootPath: string;
  readonly scannedAt: string;
};

export type ProjectScanResult = {
  readonly files: readonly FileIndexEntry[];
  readonly detection: ProjectDetection;
};

export async function scanProject(
  input: ProjectScanInput
): Promise<ProjectScanResult> {
  const files = await scanFiles(input.rootPath, input.scannedAt);
  const packageJsonResult = await readPackageJson(input.rootPath);

  if (!packageJsonResult.ok) {
    throw packageJsonResult.error;
  }

  const detectedLockFiles = lockFiles(files);
  const packageManager = detectPackageManager({
    packageJson: packageJsonResult.value,
    lockFiles: detectedLockFiles
  });
  const frameworks = detectFrameworks(packageJsonResult.value);
  const commands = detectScriptCommands(packageJsonResult.value, packageManager);

  return {
    files,
    detection: {
      packageManager,
      lockFiles: detectedLockFiles,
      packageJson: packageJsonResult.value,
      languages: summarizeLanguages(files).filter((language) => language.name !== "Other"),
      frameworks,
      testFrameworks: unique(
        frameworks
          .map((framework) => framework.name)
          .filter((name) => testFrameworkNames.has(name))
      ),
      sourceRoots: await detectSourceRoots(input.rootPath),
      testRoots: await detectTestRoots(input.rootPath),
      ...commands
    }
  };
}
