const dependencyFileNames = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json",
  "go.mod",
  "go.sum",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.lockfile",
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "poetry.lock",
  "uv.lock",
  "Pipfile",
  "Pipfile.lock",
  "Cargo.toml",
  "Cargo.lock"
]);

export const dependencyFiles = [...dependencyFileNames].sort((a, b) => a.localeCompare(b));

export function normalizeDependencyPath(filePath: string): string {
  return filePath.replaceAll("\\", "/");
}

export function isDependencyFile(filePath: string): boolean {
  const normalized = normalizeDependencyPath(filePath);

  return dependencyFileNames.has(normalized);
}
