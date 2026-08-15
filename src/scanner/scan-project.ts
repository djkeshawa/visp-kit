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
import { uniqueLocaleSorted as unique } from "../core/collections.js";

const testFrameworkNames = new Set(["vitest", "jest", "playwright", "cypress"]);

function lockFiles(files: readonly FileIndexEntry[]): string[] {
  const names = new Set([
    "pnpm-lock.yaml",
    "package-lock.json",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "go.sum",
    "poetry.lock",
    "uv.lock",
    "Pipfile.lock",
    "Cargo.lock",
    "gradle.lockfile"
  ]);

  return files
    .map((file) => file.path)
    .filter((filePath) => names.has(filePath))
    .sort((a, b) => a.localeCompare(b));
}

function mergeCommands(left: readonly string[], right: readonly string[]): readonly string[] {
  return unique([...left, ...right]);
}

function manifestCommands(files: readonly FileIndexEntry[]): {
  readonly buildCommands: readonly string[];
  readonly testCommands: readonly string[];
  readonly lintCommands: readonly string[];
  readonly typecheckCommands: readonly string[];
} {
  const paths = new Set(files.map((file) => file.path));
  const buildCommands: string[] = [];
  const testCommands: string[] = [];
  const lintCommands: string[] = [];
  const typecheckCommands: string[] = [];

  if (paths.has("go.mod")) {
    buildCommands.push("go build ./...");
    testCommands.push("go test ./...");
    lintCommands.push("go vet ./...");
  }

  if (paths.has("Cargo.toml")) {
    buildCommands.push("cargo build");
    testCommands.push("cargo test");
    lintCommands.push("cargo clippy --all-targets --all-features");
    typecheckCommands.push("cargo check");
  }

  if (paths.has("pom.xml")) {
    buildCommands.push("mvn verify");
    testCommands.push("mvn test");
  }

  if (paths.has("build.gradle") || paths.has("build.gradle.kts")) {
    const gradle = paths.has("gradlew") ? "./gradlew" : "gradle";
    buildCommands.push(`${gradle} build`);
    testCommands.push(`${gradle} test`);
    lintCommands.push(`${gradle} check`);
  }

  if (paths.has("pyproject.toml") || paths.has("requirements.txt") || paths.has("setup.py")) {
    testCommands.push("python -m pytest");
  }

  return {
    buildCommands: unique(buildCommands),
    testCommands: unique(testCommands),
    lintCommands: unique(lintCommands),
    typecheckCommands: unique(typecheckCommands)
  };
}

export type ProjectScanInput = {
  readonly rootPath: string;
  readonly scannedAt: string;
};

export type ProjectScanResult = {
  readonly files: readonly FileIndexEntry[];
  readonly detection: ProjectDetection;
};

export async function scanProject(input: ProjectScanInput): Promise<ProjectScanResult> {
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
  const nonPackageCommands = manifestCommands(files);

  return {
    files,
    detection: {
      packageManager,
      lockFiles: detectedLockFiles,
      packageJson: packageJsonResult.value,
      languages: summarizeLanguages(files).filter((language) => language.name !== "Other"),
      frameworks,
      testFrameworks: unique(
        frameworks.map((framework) => framework.name).filter((name) => testFrameworkNames.has(name))
      ),
      sourceRoots: await detectSourceRoots(input.rootPath),
      testRoots: await detectTestRoots(input.rootPath),
      buildCommands: mergeCommands(commands.buildCommands, nonPackageCommands.buildCommands),
      testCommands: mergeCommands(commands.testCommands, nonPackageCommands.testCommands),
      lintCommands: mergeCommands(commands.lintCommands, nonPackageCommands.lintCommands),
      typecheckCommands: mergeCommands(
        commands.typecheckCommands,
        nonPackageCommands.typecheckCommands
      )
    }
  };
}
