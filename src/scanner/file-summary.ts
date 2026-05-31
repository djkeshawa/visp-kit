import { readFile } from "node:fs/promises";
import path from "node:path";

import { isBinaryPath, isLockFile } from "./ignore-rules.js";
import { type FileIndexEntry, type FileSummary } from "./types.js";

export const maxSummaryFileSizeBytes = 250 * 1024;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function matches(content: string, regex: RegExp, group = 1): string[] {
  return unique(
    [...content.matchAll(regex)]
      .map((match) => match[group]?.trim())
      .filter((value): value is string => Boolean(value))
  );
}

export function extractImports(content: string): string[] {
  return unique([
    ...matches(content, /^\s*import(?:\s+type)?[\s\S]*?\sfrom\s+["']([^"']+)["']/gm),
    ...matches(content, /^\s*import\s+["']([^"']+)["']/gm),
    ...matches(content, /require\(\s*["']([^"']+)["']\s*\)/gm)
  ]);
}

export function extractExports(content: string): string[] {
  const named = matches(
    content,
    /^\s*export\s+(?:async\s+)?(?:function|class|interface|type|const|let|var|enum)\s+([A-Za-z_$][\w$]*)/gm
  );
  const defaults = /^\s*export\s+default\b/m.test(content) ? ["default"] : [];
  const common = /module\.exports\s*=/.test(content) ? ["module.exports"] : [];

  return unique([...named, ...defaults, ...common]);
}

export function extractSymbols(content: string): string[] {
  return unique([
    ...matches(content, /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm),
    ...matches(content, /^\s*(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/gm),
    ...matches(content, /^\s*(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/gm),
    ...matches(content, /^\s*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)/gm),
    ...matches(content, /^\s*(?:export\s+)?enum\s+([A-Za-z_$][\w$]*)/gm),
    ...matches(content, /^\s*(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=/gm)
  ]);
}

function extractComments(content: string): string[] {
  const comments = [
    ...matches(content, /^\s*\/\/\s?(.{4,120})$/gm),
    ...matches(content, /\/\*\*\s*([\s\S]*?)\s*\*\//gm)
  ];

  return comments
    .map((comment) => comment.replaceAll(/\s+/g, " ").trim())
    .filter((comment) => comment.length > 0)
    .slice(0, 5);
}

function skippedSummary(
  file: FileIndexEntry,
  reason: string,
  lineCount = 0
): FileSummary {
  return {
    path: file.path,
    hash: file.hash,
    language: file.language,
    sizeBytes: file.sizeBytes,
    lineCount,
    imports: [],
    exports: [],
    symbols: [],
    comments: [],
    summaryKind: "deterministic",
    summarySkippedReason: reason
  };
}

export async function summarizeFile(
  rootPath: string,
  file: FileIndexEntry
): Promise<FileSummary> {
  if (isBinaryPath(file.path)) {
    return skippedSummary(file, "binary_file");
  }

  if (isLockFile(file.path)) {
    return skippedSummary(file, "lock_file");
  }

  if (file.sizeBytes > maxSummaryFileSizeBytes) {
    return skippedSummary(file, "file_too_large");
  }

  const content = await readFile(path.join(rootPath, file.path), "utf8");
  const lineCount = content.length === 0 ? 0 : content.split(/\r?\n/).length;
  const isJsTs = file.language === "TypeScript" || file.language === "JavaScript";

  return {
    path: file.path,
    hash: file.hash,
    language: file.language,
    sizeBytes: file.sizeBytes,
    lineCount,
    imports: isJsTs ? extractImports(content) : [],
    exports: isJsTs ? extractExports(content) : [],
    symbols: isJsTs ? extractSymbols(content) : [],
    comments: extractComments(content),
    summaryKind: "deterministic"
  };
}
