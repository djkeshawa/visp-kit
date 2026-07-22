import { constants, type BigIntStats } from "node:fs";
import { lstat, open, readlink } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { listGitUntrackedFiles } from "../core/git-untracked.js";
import { err, ok, type Result } from "../core/result.js";
import {
  isDependencyFile,
  isGeneratedVispReviewFile,
  isTestFile,
  normalizeReviewPath
} from "./diff-summary.js";

export type DiffLoadOptions = {
  readonly targetPath: string;
  readonly staged?: boolean;
  readonly unstaged?: boolean;
  readonly base?: string;
  readonly commandRunner?: CommandRunner;
  readonly maxDiffCharsPerFile?: number;
  readonly maxTotalDiffChars?: number;
};

export type LoadedDiffFile = {
  readonly path: string;
  readonly changeType: "added" | "modified" | "deleted" | "renamed" | "copied" | "unknown";
  readonly additions: number;
  readonly deletions: number;
  readonly isDependencyFile: boolean;
  readonly isTestFile: boolean;
  readonly isGeneratedVispFile: boolean;
  readonly isBinary: boolean;
  readonly diffTruncated: boolean;
  readonly diff: string;
};

export type LoadedDiff = {
  readonly files: readonly LoadedDiffFile[];
  readonly diffSource: string;
  readonly baseRef: string | null;
};

type PartialFile = {
  path: string;
  changeType: LoadedDiffFile["changeType"];
  additions: number;
  deletions: number;
  isBinary: boolean;
  sourceTruncated: boolean;
  diff: string;
};

type RawDiff = {
  readonly nameStatus: string;
  readonly numstat: string;
  readonly diff: string;
};

function cleanPath(value: string): string {
  return normalizeReviewPath(value).replace(/^"|"$/g, "");
}

function nulFields(stdout: string): string[] {
  const fields = stdout.split("\0");
  if (fields.at(-1) === "") fields.pop();
  return fields;
}

function changeTypeFromStatus(status: string): LoadedDiffFile["changeType"] {
  const marker = status.at(0);

  if (marker === "A") return "added";
  if (marker === "M") return "modified";
  if (marker === "D") return "deleted";
  if (marker === "R") return "renamed";
  if (marker === "C") return "copied";
  return "unknown";
}

function parseNameStatus(stdout: string): Map<string, LoadedDiffFile["changeType"]> {
  const entries = new Map<string, LoadedDiffFile["changeType"]>();
  const fields = nulFields(stdout);

  for (let index = 0; index < fields.length; ) {
    const status = fields[index];
    index += 1;

    if (status === undefined || status.length === 0) continue;

    if (status.startsWith("R") || status.startsWith("C")) index += 1;
    const filePath = fields[index];
    index += 1;

    if (filePath !== undefined && filePath.length > 0) {
      entries.set(filePath, changeTypeFromStatus(status));
    }
  }

  return entries;
}

function parseNumstat(stdout: string): Map<
  string,
  {
    readonly additions: number;
    readonly deletions: number;
    readonly isBinary: boolean;
  }
> {
  const entries = new Map<
    string,
    {
      readonly additions: number;
      readonly deletions: number;
      readonly isBinary: boolean;
    }
  >();
  const fields = nulFields(stdout);

  for (let index = 0; index < fields.length; ) {
    const record = fields[index];
    index += 1;

    if (record === undefined || record.length === 0) continue;

    const firstTab = record.indexOf("\t");
    const secondTab = firstTab < 0 ? -1 : record.indexOf("\t", firstTab + 1);

    if (firstTab < 0 || secondTab < 0) continue;

    const additions = record.slice(0, firstTab);
    const deletions = record.slice(firstTab + 1, secondTab);
    let filePath = record.slice(secondTab + 1);

    if (filePath.length === 0) {
      index += 1;
      filePath = fields[index] ?? "";
      index += 1;
    }

    if (filePath.length === 0) continue;

    const isBinary = additions === "-" || deletions === "-";

    entries.set(filePath, {
      additions: isBinary ? 0 : Number.parseInt(additions, 10) || 0,
      deletions: isBinary ? 0 : Number.parseInt(deletions, 10) || 0,
      isBinary
    });
  }

  return entries;
}

function parseDiffChunks(stdout: string): Map<string, string> {
  const chunks = new Map<string, string>();
  let currentPath: string | undefined;
  let currentLines: string[] = [];

  const flush = (): void => {
    if (currentPath !== undefined) {
      const existing = chunks.get(currentPath);
      const text = currentLines.join("\n");
      chunks.set(currentPath, existing === undefined ? text : `${existing}\n${text}`);
    }
  };

  for (const line of stdout.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);

    if (match !== null) {
      flush();
      currentPath = cleanPath(match[2] ?? match[1] ?? "unknown");
      currentLines = [line];
      continue;
    }

    if (currentPath !== undefined) {
      currentLines.push(line);
    }
  }

  flush();
  return chunks;
}

function mergeRaw(raw: RawDiff, files: Map<string, PartialFile>): void {
  const status = parseNameStatus(raw.nameStatus);
  const stats = parseNumstat(raw.numstat);
  const chunks = parseDiffChunks(raw.diff);
  const paths = new Set([...status.keys(), ...stats.keys()]);

  for (const filePath of paths) {
    const existing = files.get(filePath);
    const nextStats = stats.get(filePath);
    const nextDiff = chunks.get(filePath) ?? "";

    files.set(filePath, {
      path: filePath,
      changeType: status.get(filePath) ?? existing?.changeType ?? "unknown",
      additions: (existing?.additions ?? 0) + (nextStats?.additions ?? 0),
      deletions: (existing?.deletions ?? 0) + (nextStats?.deletions ?? 0),
      isBinary: Boolean(existing?.isBinary || nextStats?.isBinary),
      sourceTruncated: existing?.sourceTruncated ?? false,
      diff: [existing?.diff, nextDiff].filter(Boolean).join("\n")
    });
  }
}

function truncateFiles(input: {
  readonly files: readonly PartialFile[];
  readonly maxDiffCharsPerFile: number;
  readonly maxTotalDiffChars: number;
}): readonly LoadedDiffFile[] {
  let remaining = input.maxTotalDiffChars;

  return input.files.map((file) => {
    const perFile = Math.min(input.maxDiffCharsPerFile, Math.max(0, remaining));
    const truncated = file.diff.length > perFile;
    const diff = truncated ? file.diff.slice(0, perFile) : file.diff;

    remaining = Math.max(0, remaining - diff.length);

    return {
      path: file.path,
      changeType: file.changeType,
      additions: file.additions,
      deletions: file.deletions,
      isDependencyFile: isDependencyFile(file.path),
      isTestFile: isTestFile(file.path),
      isGeneratedVispFile: isGeneratedVispReviewFile(file.path),
      isBinary: file.isBinary,
      diffTruncated: file.sourceTruncated || truncated || file.diff.length > diff.length,
      diff
    };
  });
}

function comparePaths(left: PartialFile, right: PartialFile): number {
  if (left.path < right.path) return -1;
  if (left.path > right.path) return 1;
  return 0;
}

function diffPath(prefix: "a" | "b", filePath: string): string {
  const value = `${prefix}/${filePath}`;
  const requiresQuoting = [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 || character === '"' || character === "\\";
  });

  return requiresQuoting ? JSON.stringify(value) : value;
}

function textLines(content: string): readonly string[] {
  if (content.length === 0) return [];

  const lines = content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  return lines;
}

function syntheticTextDiff(input: {
  readonly filePath: string;
  readonly content: string;
  readonly mode: "100644" | "120000";
}): { readonly additions: number; readonly diff: string } {
  const oldPath = diffPath("a", input.filePath);
  const newPath = diffPath("b", input.filePath);
  const lines = textLines(input.content);
  const header = [
    `diff --git ${oldPath} ${newPath}`,
    `new file mode ${input.mode}`,
    "--- /dev/null",
    `+++ ${newPath}`
  ];

  if (lines.length === 0) {
    return { additions: 0, diff: header.join("\n") };
  }

  return {
    additions: lines.length,
    diff: [...header, `@@ -0,0 +1,${lines.length} @@`, ...lines.map((line) => `+${line}`)].join(
      "\n"
    )
  };
}

function syntheticBinaryDiff(filePath: string): string {
  const oldPath = diffPath("a", filePath);
  const newPath = diffPath("b", filePath);

  return [
    `diff --git ${oldPath} ${newPath}`,
    "new file mode 100644",
    `Binary files /dev/null and ${newPath} differ`
  ].join("\n");
}

async function readRegularFile(input: {
  readonly absolutePath: string;
  readonly maxBytes: number;
  readonly beforeOpen: BigIntStats;
}): Promise<{ readonly content: Buffer; readonly truncated: boolean }> {
  const noFollow = constants.O_NOFOLLOW as number | undefined;
  const flags = typeof noFollow === "number" ? constants.O_RDONLY | noFollow : constants.O_RDONLY;
  const handle = await open(input.absolutePath, flags);

  try {
    const current = await handle.stat({ bigint: true });
    const afterOpen = await lstat(input.absolutePath, { bigint: true });

    if (
      !input.beforeOpen.isFile() ||
      input.beforeOpen.isSymbolicLink() ||
      !current.isFile() ||
      current.isSymbolicLink() ||
      !afterOpen.isFile() ||
      afterOpen.isSymbolicLink() ||
      typeof input.beforeOpen.dev !== "bigint" ||
      typeof input.beforeOpen.ino !== "bigint" ||
      typeof current.dev !== "bigint" ||
      typeof current.ino !== "bigint" ||
      typeof afterOpen.dev !== "bigint" ||
      typeof afterOpen.ino !== "bigint" ||
      input.beforeOpen.dev !== current.dev ||
      input.beforeOpen.ino !== current.ino ||
      input.beforeOpen.dev !== afterOpen.dev ||
      input.beforeOpen.ino !== afterOpen.ino
    ) {
      throw new VispError(
        "FILE_SYSTEM_ERROR",
        `Unable to load untracked Git file ${input.absolutePath}: file changed while opening.`
      );
    }

    const readLimit = Math.max(1, input.maxBytes + 1);
    const contentLength =
      current.size > BigInt(readLimit) ? readLimit : Math.max(1, Number(current.size));
    const content = Buffer.allocUnsafe(contentLength);
    const { bytesRead } = await handle.read(content, 0, content.length, 0);

    return {
      content: content.subarray(0, bytesRead),
      truncated: current.size > BigInt(bytesRead)
    };
  } finally {
    await handle.close();
  }
}

function decodeUtf8(content: Buffer, truncated: boolean): string | null {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(content, { stream: truncated });
  } catch {
    return null;
  }
}

async function loadUntrackedFile(input: {
  readonly targetPath: string;
  readonly filePath: string;
  readonly maxBytes: number;
}): Promise<Result<PartialFile, VispError>> {
  const absolutePath = path.join(input.targetPath, input.filePath);

  try {
    const stats = await lstat(absolutePath, { bigint: true });

    if (stats.isSymbolicLink()) {
      const target = await readlink(absolutePath);
      const synthetic = syntheticTextDiff({
        filePath: input.filePath,
        content: target,
        mode: "120000"
      });

      return ok({
        path: input.filePath,
        changeType: "added",
        additions: synthetic.additions,
        deletions: 0,
        isBinary: false,
        sourceTruncated: false,
        diff: synthetic.diff
      });
    }

    if (!stats.isFile()) {
      return err(
        new VispError(
          "FILE_SYSTEM_ERROR",
          `Unable to load untracked Git file ${input.filePath}: unsupported file type.`
        )
      );
    }

    const read = await readRegularFile({
      absolutePath,
      maxBytes: input.maxBytes,
      beforeOpen: stats
    });
    const decoded = read.content.includes(0) ? null : decodeUtf8(read.content, read.truncated);

    if (decoded === null) {
      return ok({
        path: input.filePath,
        changeType: "added",
        additions: 0,
        deletions: 0,
        isBinary: true,
        sourceTruncated: read.truncated,
        diff: syntheticBinaryDiff(input.filePath)
      });
    }

    const synthetic = syntheticTextDiff({
      filePath: input.filePath,
      content: decoded,
      mode: "100644"
    });

    return ok({
      path: input.filePath,
      changeType: "added",
      additions: synthetic.additions,
      deletions: 0,
      isBinary: false,
      sourceTruncated: read.truncated,
      diff: synthetic.diff
    });
  } catch (cause) {
    return err(
      new VispError("FILE_SYSTEM_ERROR", `Unable to load untracked Git file ${input.filePath}.`, {
        cause
      })
    );
  }
}

async function loadUntrackedFiles(input: {
  readonly targetPath: string;
  readonly runner: CommandRunner;
  readonly maxDiffCharsPerFile: number;
  readonly maxTotalDiffChars: number;
}): Promise<Result<readonly PartialFile[], VispError>> {
  const paths = await listGitUntrackedFiles({
    targetPath: input.targetPath,
    commandRunner: input.runner
  });

  if (!paths.ok) return paths;

  const files: PartialFile[] = [];
  let remainingBytes = Math.max(0, input.maxTotalDiffChars);

  for (const filePath of paths.value) {
    const maxBytes = Math.min(Math.max(0, input.maxDiffCharsPerFile), remainingBytes);
    const file = await loadUntrackedFile({
      targetPath: input.targetPath,
      filePath,
      maxBytes
    });

    if (!file.ok) return file;

    files.push(file.value);
    remainingBytes = Math.max(0, remainingBytes - Math.min(maxBytes, file.value.diff.length));
  }

  return ok(files);
}

async function runGit(input: {
  readonly targetPath: string;
  readonly args: readonly string[];
  readonly runner: CommandRunner;
}): Promise<Result<string, VispError>> {
  const result = await input.runner.run("git", input.args, {
    cwd: input.targetPath
  });

  if (!result.ok) return result;
  return ok(result.value.stdout);
}

async function loadRaw(input: {
  readonly targetPath: string;
  readonly runner: CommandRunner;
  readonly diffArgs: readonly string[];
}): Promise<Result<RawDiff, VispError>> {
  const nameStatus = await runGit({
    targetPath: input.targetPath,
    runner: input.runner,
    args: [...input.diffArgs, "--name-status", "-z", "--"]
  });

  if (!nameStatus.ok) return nameStatus;

  const numstat = await runGit({
    targetPath: input.targetPath,
    runner: input.runner,
    args: [...input.diffArgs, "--numstat", "-z", "--"]
  });

  if (!numstat.ok) return numstat;

  const diff = await runGit({
    targetPath: input.targetPath,
    runner: input.runner,
    args: [...input.diffArgs, "--"]
  });

  if (!diff.ok) return diff;

  return ok({
    nameStatus: nameStatus.value,
    numstat: numstat.value,
    diff: diff.value
  });
}

async function ensureGitRepo(input: {
  readonly targetPath: string;
  readonly runner: CommandRunner;
}): Promise<Result<void, VispError>> {
  const result = await runGit({
    targetPath: input.targetPath,
    runner: input.runner,
    args: ["rev-parse", "--is-inside-work-tree"]
  });

  if (!result.ok || result.value.trim() !== "true") {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "visp review requires Git diff data. Run it inside a Git repository."
      )
    );
  }

  return ok(undefined);
}

function requestedSources(options: DiffLoadOptions): Array<{
  readonly label: string;
  readonly args: readonly string[];
}> {
  if (options.base !== undefined) {
    return [{ label: `base:${options.base}`, args: ["diff", `${options.base}...HEAD`] }];
  }

  if (options.staged || options.unstaged) {
    return [
      ...(options.unstaged ? [{ label: "unstaged", args: ["diff"] as const }] : []),
      ...(options.staged ? [{ label: "staged", args: ["diff", "--cached"] as const }] : [])
    ];
  }

  return [
    { label: "unstaged", args: ["diff"] },
    { label: "staged", args: ["diff", "--cached"] }
  ];
}

function includesUntracked(options: DiffLoadOptions): boolean {
  if (options.base !== undefined || (options.staged && !options.unstaged)) return false;
  return options.unstaged === true || options.staged !== true;
}

export async function loadGitDiff(
  options: DiffLoadOptions
): Promise<Result<LoadedDiff, VispError>> {
  const runner = options.commandRunner ?? defaultCommandRunner;
  const git = await ensureGitRepo({
    targetPath: options.targetPath,
    runner
  });

  if (!git.ok) return git;

  const files = new Map<string, PartialFile>();
  const sources = requestedSources(options);
  const maxDiffCharsPerFile = options.maxDiffCharsPerFile ?? 12_000;
  const maxTotalDiffChars = options.maxTotalDiffChars ?? 40_000;

  for (const source of sources) {
    let raw = await loadRaw({
      targetPath: options.targetPath,
      runner,
      diffArgs: source.args
    });

    if (!raw.ok && options.base !== undefined && source.args[1]?.endsWith("...HEAD")) {
      raw = await loadRaw({
        targetPath: options.targetPath,
        runner,
        diffArgs: ["diff", options.base]
      });
    }

    if (!raw.ok) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          options.base === undefined
            ? `Unable to load Git diff: ${raw.error.message}`
            : `Unable to load Git diff for base ref ${options.base}: ${raw.error.message}`
        )
      );
    }

    mergeRaw(raw.value, files);
  }

  if (includesUntracked(options)) {
    const untracked = await loadUntrackedFiles({
      targetPath: options.targetPath,
      runner,
      maxDiffCharsPerFile,
      maxTotalDiffChars
    });

    if (!untracked.ok) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Unable to load untracked Git diff: ${untracked.error.message}`
        )
      );
    }

    for (const file of untracked.value) {
      if (!files.has(file.path)) files.set(file.path, file);
    }
  }

  const loadedFiles = truncateFiles({
    files: [...files.values()].sort(comparePaths),
    maxDiffCharsPerFile,
    maxTotalDiffChars
  });

  return ok({
    files: loadedFiles,
    diffSource: [
      ...sources.map((source) => source.label),
      ...(includesUntracked(options) ? ["untracked"] : [])
    ].join("+"),
    baseRef: options.base ?? null
  });
}
