import path from "node:path";

import { readTextFile } from "../core/file-system.js";
import { toPosixPath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { type VispError } from "../core/errors.js";
import { isBinaryPath, isLockFile, shouldIgnorePath } from "../scanner/ignore-rules.js";
import { estimateTokens } from "./token-estimator.js";

export type FileSnippet = {
  readonly filePath: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly content: string;
  readonly tokenEstimate: number;
  readonly reason: string;
};

export type SnippetOptions = {
  readonly rootPath: string;
  readonly filePath: string;
  readonly maxTokens: number;
  readonly fullFile?: boolean;
  readonly reason: string;
  readonly focusTerms?: readonly string[];
};

function focusedRange(lines: readonly string[], maxTokens: number, terms: readonly string[]): { start: number; end: number } {
  const normalized = [...new Set(terms.map((term) => term.toLowerCase()).filter((term) => term.length >= 3))];
  let center = 0;
  let best = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]?.toLowerCase() ?? "";
    const matches = normalized.filter((term) => line.includes(term)).length;
    const declarationBonus = /\b(export|function|class|interface|type|def|func|struct|enum)\b/u.test(line) ? 2 : 0;
    const score = matches * 4 + (matches > 0 ? declarationBonus : 0);
    if (score > best) {
      best = score;
      center = index;
    }
  }

  if (best === 0) {
    return { start: 0, end: lineLimitForTokens(lines, maxTokens) };
  }

  let start = center;
  let end = center + 1;
  while (start > 0 || end < lines.length) {
    const nextStart = start > 0 ? start - 1 : start;
    const nextEnd = end < lines.length ? end + 1 : end;
    const candidate = lines.slice(nextStart, nextEnd).join("\n");
    if (estimateTokens(candidate) > maxTokens) break;
    start = nextStart;
    end = nextEnd;
  }
  return { start, end };
}

function lineLimitForTokens(lines: readonly string[], maxTokens: number): number {
  let selected = 0;
  let text = "";

  for (const line of lines) {
    const next = selected === 0 ? line : `${text}\n${line}`;

    if (estimateTokens(next) > maxTokens && selected > 0) {
      return selected;
    }

    text = next;
    selected += 1;

    if (estimateTokens(text) > maxTokens) {
      return selected;
    }
  }

  return selected;
}

export async function extractFileSnippet(
  options: SnippetOptions
): Promise<Result<FileSnippet | undefined, VispError>> {
  const relativePath = toPosixPath(options.filePath);

  if (shouldIgnorePath(relativePath) || isBinaryPath(relativePath) || isLockFile(relativePath)) {
    return ok(undefined);
  }

  const text = await readTextFile(path.join(options.rootPath, relativePath));

  if (!text.ok) {
    return err(text.error);
  }

  const lines = text.value.split(/\r?\n/);
  const range = options.fullFile
    ? { start: 0, end: lines.length }
    : focusedRange(lines, options.maxTokens, options.focusTerms ?? []);
  const selectedLines = lines.slice(range.start, range.end);
  const content = selectedLines.join("\n").trimEnd();

  if (content.length === 0) {
    return ok(undefined);
  }

  return ok({
    filePath: relativePath,
    startLine: range.start + 1,
    endLine: range.start + selectedLines.length,
    content,
    tokenEstimate: estimateTokens(content),
    reason: options.reason
  });
}
