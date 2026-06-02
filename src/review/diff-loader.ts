import {
  defaultCommandRunner,
  type CommandRunner
} from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
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

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.split("\t").filter((part) => part.length > 0);
    const status = parts[0];

    if (status === undefined) continue;

    const filePath = status.startsWith("R") || status.startsWith("C")
      ? parts[2]
      : parts[1];

    if (filePath !== undefined) {
      entries.set(cleanPath(filePath), changeTypeFromStatus(status));
    }
  }

  return entries;
}

function parseNumstat(stdout: string): Map<string, {
  readonly additions: number;
  readonly deletions: number;
  readonly isBinary: boolean;
}> {
  const entries = new Map<string, {
    readonly additions: number;
    readonly deletions: number;
    readonly isBinary: boolean;
  }>();

  for (const line of stdout.split(/\r?\n/)) {
    const parts = line.split("\t");
    const additions = parts[0];
    const deletions = parts[1];
    const filePath = parts.at(-1);

    if (additions === undefined || deletions === undefined || filePath === undefined) {
      continue;
    }

    const isBinary = additions === "-" || deletions === "-";

    entries.set(cleanPath(filePath), {
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
  const paths = new Set([...status.keys(), ...stats.keys(), ...chunks.keys()]);

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
      diffTruncated: truncated || file.diff.length > diff.length,
      diff
    };
  });
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
    args: [...input.diffArgs, "--name-status"]
  });

  if (!nameStatus.ok) return nameStatus;

  const numstat = await runGit({
    targetPath: input.targetPath,
    runner: input.runner,
    args: [...input.diffArgs, "--numstat"]
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

  const loadedFiles = truncateFiles({
    files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    maxDiffCharsPerFile: options.maxDiffCharsPerFile ?? 12_000,
    maxTotalDiffChars: options.maxTotalDiffChars ?? 40_000
  });

  return ok({
    files: loadedFiles,
    diffSource: sources.map((source) => source.label).join("+"),
    baseRef: options.base ?? null
  });
}
