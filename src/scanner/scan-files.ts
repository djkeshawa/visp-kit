import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import { toPosixPath } from "../core/paths.js";
import { hashFile } from "./hash.js";
import {
  isBinaryPath,
  isConfigFilePath,
  isTestFilePath,
  shouldIgnorePath
} from "./ignore-rules.js";
import { detectLanguage } from "./language.js";
import { type FileIndexEntry } from "./types.js";

function isSourceLanguage(language: string): boolean {
  return [
    "TypeScript",
    "JavaScript",
    "CSS",
    "HTML",
    "JSON",
    "Markdown",
    "Java",
    "Kotlin",
    "Python",
    "Go",
    "Rust"
  ].includes(language);
}

export async function scanFiles(
  rootPath: string,
  scannedAt: string
): Promise<FileIndexEntry[]> {
  const entries: FileIndexEntry[] = [];

  async function walk(directory: string): Promise<void> {
    const children = await readdir(directory, { withFileTypes: true });

    for (const child of children) {
      const absolutePath = path.join(directory, child.name);
      const relativePath = toPosixPath(path.relative(rootPath, absolutePath));

      if (shouldIgnorePath(relativePath)) {
        continue;
      }

      if (child.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (!child.isFile()) {
        continue;
      }

      const fileStat = await stat(absolutePath);
      const language = detectLanguage(relativePath);

      entries.push({
        path: relativePath,
        extension: path.extname(relativePath).toLowerCase(),
        sizeBytes: fileStat.size,
        hash: await hashFile(absolutePath),
        language,
        isTestFile: isTestFilePath(relativePath),
        isConfigFile: isConfigFilePath(relativePath),
        isSourceFile: isSourceLanguage(language) && !isBinaryPath(relativePath),
        lastScannedAt: scannedAt
      });
    }
  }

  await walk(rootPath);

  return entries.sort((a, b) => a.path.localeCompare(b.path));
}
