import { readFile } from "node:fs/promises";
import path from "node:path";

import { isBinaryPath, isLockFile } from "./ignore-rules.js";
import { type FileIndexEntry, type FileSummary } from "./types.js";
import { uniqueLocaleSorted as unique } from "../core/collections.js";

export const maxSummaryFileSizeBytes = 250 * 1024;

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

export function extractLanguageImports(content: string, language: string): string[] {
  if (language === "TypeScript" || language === "JavaScript") {
    return extractImports(content);
  }

  if (language === "Go") {
    return unique([
      ...matches(content, /^\s*import\s+"([^"]+)"/gm),
      ...matches(content, /^\s*"([^"]+)"$/gm)
    ]);
  }

  if (language === "Java" || language === "Kotlin") {
    return matches(content, /^\s*import\s+(?:static\s+)?([A-Za-z0-9_.*]+);?/gm);
  }

  if (language === "Python") {
    return unique([
      ...matches(content, /^\s*import\s+([A-Za-z_][\w.]*)/gm),
      ...matches(content, /^\s*from\s+([A-Za-z_][\w.]*)\s+import\s+/gm)
    ]);
  }

  if (language === "Rust") {
    return unique([
      ...matches(content, /^\s*use\s+([^;]+);/gm),
      ...matches(content, /^\s*mod\s+([A-Za-z_][\w]*);/gm)
    ]);
  }

  return [];
}

export function extractLanguageSymbols(content: string, language: string): string[] {
  if (language === "TypeScript" || language === "JavaScript") {
    return extractSymbols(content);
  }

  if (language === "Go") {
    return unique([
      ...matches(content, /^\s*func\s+(?:\([^)]+\)\s*)?([A-Za-z_][\w]*)\s*\(/gm),
      ...matches(content, /^\s*type\s+([A-Za-z_][\w]*)\s+(?:struct|interface|=|\w+)/gm)
    ]);
  }

  if (language === "Java" || language === "Kotlin") {
    return unique([
      ...matches(content, /\b(?:class|interface|enum|record)\s+([A-Za-z_][\w]*)/gm),
      ...matches(
        content,
        /^\s*(?:public|private|protected)?\s*(?:static\s+)?(?:final\s+)?[\w<>[\], ?]+\s+([A-Za-z_][\w]*)\s*\(/gm
      )
    ]);
  }

  if (language === "Python") {
    return unique([
      ...matches(content, /^\s*def\s+([A-Za-z_][\w]*)\s*\(/gm),
      ...matches(content, /^\s*class\s+([A-Za-z_][\w]*)\s*[:(]/gm)
    ]);
  }

  if (language === "Rust") {
    return unique([
      ...matches(content, /^\s*(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\(/gm),
      ...matches(content, /^\s*(?:pub\s+)?(?:struct|enum|trait)\s+([A-Za-z_][\w]*)/gm)
    ]);
  }

  return [];
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

function skippedSummary(file: FileIndexEntry, reason: string, lineCount = 0): FileSummary {
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

export async function summarizeFile(rootPath: string, file: FileIndexEntry): Promise<FileSummary> {
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

  return {
    path: file.path,
    hash: file.hash,
    language: file.language,
    sizeBytes: file.sizeBytes,
    lineCount,
    imports: extractLanguageImports(content, file.language),
    exports:
      file.language === "TypeScript" || file.language === "JavaScript"
        ? extractExports(content)
        : [],
    symbols: extractLanguageSymbols(content, file.language),
    comments: extractComments(content),
    summaryKind: "deterministic"
  };
}
