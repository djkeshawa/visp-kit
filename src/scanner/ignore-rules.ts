import path from "node:path";

import { isDependencyFile } from "../dependencies/dependency-files.js";

export const defaultIgnoredPaths = [
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".git",
  ".visp",
  ".next",
  ".nuxt",
  ".svelte-kit",
  "out",
  "target",
  "vendor",
  ".turbo",
  ".cache",
  "tmp",
  "temp",
  "logs"
] as const;

const binaryExtensions = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".mp4",
  ".mov",
  ".mp3",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".wasm"
]);

export function shouldIgnorePath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]+/);
  return parts.some((part) => defaultIgnoredPaths.includes(part as never));
}

export function isBinaryPath(filePath: string): boolean {
  return binaryExtensions.has(path.extname(filePath).toLowerCase());
}

export function isLockFile(relativePath: string): boolean {
  return isDependencyFile(path.basename(relativePath));
}

export function isTestFilePath(relativePath: string): boolean {
  return (
    /(?:^|[/\\])(?:test|tests|__tests__|spec|specs|e2e|integration)(?:[/\\]|$)/.test(
      relativePath
    ) ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath) ||
    /_test\.go$/.test(relativePath) ||
    /(?:Test|Tests)\.java$/.test(relativePath) ||
    /(?:^|[/\\])test_[^/\\]+\.py$/.test(relativePath) ||
    /_test\.py$/.test(relativePath) ||
    /_test\.rs$/.test(relativePath)
  );
}

export function isConfigFilePath(relativePath: string): boolean {
  return /(?:^|[/\\])(?:package\.json|tsconfig.*\.json|vitest\.config\.[jt]s|vite\.config\.[jt]s|webpack\.config\.[jt]s|eslint\.config\.[jt]s|go\.mod|pom\.xml|build\.gradle|build\.gradle\.kts|settings\.gradle|settings\.gradle\.kts|pyproject\.toml|requirements(?:-dev)?\.txt|Cargo\.toml)$/u.test(
    relativePath
  );
}
