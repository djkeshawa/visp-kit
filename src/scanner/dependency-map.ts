import { type FrameworkDetection, type PackageJsonInfo, type ProjectDetection } from "./types.js";

export type DependencyMap = {
  readonly generatedAt: string;
  readonly packageManager: string;
  readonly lockFiles: readonly string[];
  readonly dependencies: Record<string, string>;
  readonly devDependencies: Record<string, string>;
  readonly peerDependencies: Record<string, string>;
  readonly optionalDependencies: Record<string, string>;
  readonly detectedFrameworks: readonly FrameworkDetection[];
  readonly scripts: Record<string, string>;
  readonly commandSummary: {
    readonly build: readonly string[];
    readonly test: readonly string[];
    readonly lint: readonly string[];
    readonly typecheck: readonly string[];
  };
};

function emptyPackageJson(): PackageJsonInfo {
  return {
    path: "package.json",
    scripts: {},
    dependencies: {},
    devDependencies: {},
    peerDependencies: {},
    optionalDependencies: {}
  };
}

export function buildDependencyMap(
  detection: ProjectDetection,
  generatedAt: string
): DependencyMap {
  const packageJson = detection.packageJson ?? emptyPackageJson();

  return {
    generatedAt,
    packageManager: detection.packageManager,
    lockFiles: detection.lockFiles,
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
    peerDependencies: packageJson.peerDependencies,
    optionalDependencies: packageJson.optionalDependencies,
    detectedFrameworks: detection.frameworks,
    scripts: packageJson.scripts,
    commandSummary: {
      build: detection.buildCommands,
      test: detection.testCommands,
      lint: detection.lintCommands,
      typecheck: detection.typecheckCommands
    }
  };
}
