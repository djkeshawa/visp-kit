import path from "node:path";

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

const lockFileNames = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "yarn.lock",
  "bun.lock",
  "bun.lockb"
]);

export function shouldIgnorePath(relativePath: string): boolean {
  const parts = relativePath.split(/[\\/]+/);
  return parts.some((part) => defaultIgnoredPaths.includes(part as never));
}

export function isBinaryPath(filePath: string): boolean {
  return binaryExtensions.has(path.extname(filePath).toLowerCase());
}

export function isLockFile(relativePath: string): boolean {
  return lockFileNames.has(path.basename(relativePath));
}

export function isTestFilePath(relativePath: string): boolean {
  return /(?:^|[/\\])(?:test|tests|__tests__|spec|specs|e2e|integration)(?:[/\\]|$)/.test(
    relativePath
  ) || /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relativePath);
}

export function isConfigFilePath(relativePath: string): boolean {
  return /(?:^|[/\\])(?:package\.json|tsconfig.*\.json|vitest\.config\.[jt]s|vite\.config\.[jt]s|webpack\.config\.[jt]s|eslint\.config\.[jt]s)$/u.test(
    relativePath
  );
}
