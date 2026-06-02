import path from "node:path";

import { readTextFile } from "../core/file-system.js";
import { toPosixPath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { VispError } from "../core/errors.js";
import {
  isBinaryPath,
  isLockFile,
  shouldIgnorePath
} from "../scanner/ignore-rules.js";
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
};

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

  if (
    shouldIgnorePath(relativePath) ||
    isBinaryPath(relativePath) ||
    isLockFile(relativePath)
  ) {
    return ok(undefined);
  }

  const text = await readTextFile(path.join(options.rootPath, relativePath));

  if (!text.ok) {
    return err(text.error);
  }

  const lines = text.value.split(/\r?\n/);
  const selectedLines = options.fullFile
    ? lines
    : lines.slice(0, lineLimitForTokens(lines, options.maxTokens));
  const content = selectedLines.join("\n").trimEnd();

  if (content.length === 0) {
    return ok(undefined);
  }

  return ok({
    filePath: relativePath,
    startLine: 1,
    endLine: selectedLines.length,
    content,
    tokenEstimate: estimateTokens(content),
    reason: options.reason
  });
}
