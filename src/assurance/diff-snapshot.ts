import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

import {
  type DiffSnapshot,
  type DiffSnapshotChangeUnit,
  createDiffSnapshotChangeUnitId,
  diffSnapshotSchema
} from "../artifacts/schemas/diff-snapshot.schema.js";
import {
  type AssuranceCaseWithoutHash,
  assuranceCasePathSchema
} from "../artifacts/schemas/assurance-case.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { listGitUntrackedFiles } from "../core/git-untracked.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleText, hashOracleValue } from "../oracle/oracle-authorization.js";
import { isGeneratedVispReviewFile } from "../review/diff-summary.js";
import { canonicalJsonV1, compareUtf16CodeUnits } from "../integration/canonical-json.js";

type SnapshotMode = DiffSnapshot["mode"];
type SnapshotLayer = DiffSnapshotChangeUnit["layer"];

export type CaptureDiffSnapshotInput = {
  readonly targetPath: string;
  readonly mode: SnapshotMode;
  readonly baseRevision: string;
  readonly targetRevision?: string;
  readonly commandRunner?: CommandRunner;
};

type ChangedPath = {
  readonly status: string;
  readonly beforePath?: string;
  readonly afterPath?: string;
};

type PendingHunk = Omit<Extract<DiffSnapshotChangeUnit, { kind: "hunk" }>, "id" | "occurrence">;
type PendingFile = Omit<Extract<DiffSnapshotChangeUnit, { kind: "file" }>, "id">;
type PendingUnit = PendingHunk | PendingFile;

const diffFlags = [
  "--binary",
  "--full-index",
  "--no-ext-diff",
  "--no-textconv",
  "--find-renames",
  "--no-color",
  "--unified=3"
] as const;

function normalizedText(value: string): string {
  return value.replaceAll("\r\n", "\n").replaceAll("\r", "\n");
}

function safePath(value: string): Result<string, VispError> {
  const segments = value.split("/");
  if (
    value.includes("\\") ||
    value.includes("\0") ||
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    return err(new VispError("VALIDATION_FAILED", `Unsafe diff path: ${JSON.stringify(value)}.`));
  }
  const parsed = assuranceCasePathSchema.safeParse(value);
  return parsed.success
    ? ok(parsed.data)
    : err(new VispError("VALIDATION_FAILED", `Unsafe diff path: ${JSON.stringify(value)}.`));
}

function parseNameStatus(value: string): Result<ChangedPath[], VispError> {
  const tokens = value.split("\0").filter((token) => token.length > 0);
  const changes: ChangedPath[] = [];

  for (let index = 0; index < tokens.length; ) {
    const status = tokens[index++]!;
    if (/^U|^[A-Z]U|^U[A-Z]/u.test(status)) {
      return err(new VispError("VALIDATION_FAILED", `Unresolved Git status ${status}.`));
    }
    if (/^C\d*$/u.test(status)) {
      return err(new VispError("VALIDATION_FAILED", "Git copy status is unsupported."));
    }
    if (/^R\d*$/u.test(status)) {
      const before = tokens[index++];
      const after = tokens[index++];
      if (before === undefined || after === undefined) {
        return err(new VispError("VALIDATION_FAILED", "Malformed renamed diff path record."));
      }
      const safeBefore = safePath(before);
      const safeAfter = safePath(after);
      if (!safeBefore.ok) return safeBefore;
      if (!safeAfter.ok) return safeAfter;
      changes.push({ status, beforePath: safeBefore.value, afterPath: safeAfter.value });
      continue;
    }

    const rawPath = tokens[index++];
    if (rawPath === undefined) {
      return err(new VispError("VALIDATION_FAILED", "Malformed diff path record."));
    }
    const parsedPath = safePath(rawPath);
    if (!parsedPath.ok) return parsedPath;
    changes.push({
      status,
      beforePath: status.startsWith("A") ? undefined : parsedPath.value,
      afterPath: status.startsWith("D") ? undefined : parsedPath.value
    });
  }

  return ok(changes);
}

function splitDiffChunks(value: string): string[] {
  const normalized = normalizedText(value);
  const starts = [...normalized.matchAll(/^diff --git /gmu)].map((match) => match.index ?? 0);
  return starts.map((start, index) => normalized.slice(start, starts[index + 1]));
}

function hunkParts(chunk: string): Array<{
  readonly oldStart: number;
  readonly oldLines: number;
  readonly newStart: number;
  readonly newLines: number;
  readonly patch: string;
}> {
  const matches = [...chunk.matchAll(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@.*$/gmu)];
  return matches.map((match, index) => ({
    oldStart: Number(match[1]),
    oldLines: Number(match[2] ?? "1"),
    newStart: Number(match[3]),
    newLines: Number(match[4] ?? "1"),
    patch: chunk.slice(match.index ?? 0, matches[index + 1]?.index)
  }));
}

function fileMetadataUnits(
  layer: SnapshotLayer,
  change: ChangedPath,
  chunk: string,
  hunksPresent: boolean
): PendingFile[] {
  const binary = /^(?:GIT binary patch|Binary files )/mu.test(chunk);
  const beforeMode =
    /^old mode ([0-7]{6})$/mu.exec(chunk)?.[1] ??
    /^deleted file mode ([0-7]{6})$/mu.exec(chunk)?.[1];
  const afterMode =
    /^new mode ([0-7]{6})$/mu.exec(chunk)?.[1] ?? /^new file mode ([0-7]{6})$/mu.exec(chunk)?.[1];
  const renamed = /^R/u.test(change.status);
  const detail = chunk.length > 0 ? chunk : `${change.status}\n`;
  const common = {
    kind: "file" as const,
    layer,
    detail,
    detailSha256: hashOracleText(detail),
    ...(change.beforePath === undefined ? {} : { beforePath: change.beforePath }),
    ...(change.afterPath === undefined ? {} : { afterPath: change.afterPath })
  };
  const units: PendingFile[] = [];
  if (binary) units.push({ ...common, category: "binary" });
  if (renamed) units.push({ ...common, category: "rename" });
  if (beforeMode !== undefined || afterMode !== undefined) {
    units.push({
      ...common,
      category: "mode",
      ...(beforeMode === undefined ? {} : { beforeMode }),
      ...(afterMode === undefined ? {} : { afterMode })
    });
  }
  if (units.length === 0 && !hunksPresent) units.push({ ...common, category: "empty" });
  return units;
}

function parseLayer(input: {
  readonly layer: SnapshotLayer;
  readonly nameStatus: string;
  readonly patch: string;
}): Result<PendingUnit[], VispError> {
  const parsedChanges = parseNameStatus(input.nameStatus);
  if (!parsedChanges.ok) return parsedChanges;
  const chunks = splitDiffChunks(input.patch);
  if (/^diff --cc /mu.test(input.patch) || /^@@@ /mu.test(input.patch)) {
    return err(new VispError("VALIDATION_FAILED", "Combined diffs are unsupported."));
  }
  if (chunks.length !== parsedChanges.value.length) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Diff patch and name-status outputs describe different path counts."
      )
    );
  }
  const units: PendingUnit[] = [];

  for (const [index, change] of parsedChanges.value.entries()) {
    const paths = [change.beforePath, change.afterPath].filter(
      (value): value is string => value !== undefined
    );
    if (paths.length > 0 && paths.every(isGeneratedVispReviewFile)) continue;
    const chunk = chunks[index] ?? "";
    const path = change.afterPath ?? change.beforePath;
    if (path === undefined) {
      return err(new VispError("VALIDATION_FAILED", "Diff change has no usable path."));
    }
    const hunks = hunkParts(chunk);
    units.push(...fileMetadataUnits(input.layer, change, chunk, hunks.length > 0));
    for (const hunk of hunks) {
      units.push({
        kind: "hunk",
        layer: input.layer,
        path,
        ...hunk,
        patchSha256: hashOracleText(hunk.patch)
      });
    }
  }

  return ok(units);
}

async function untrackedUnits(
  targetPath: string,
  filePaths: readonly string[]
): Promise<Result<PendingUnit[], VispError>> {
  const units: PendingUnit[] = [];
  for (const rawPath of filePaths) {
    const parsedPath = safePath(rawPath);
    if (!parsedPath.ok) return parsedPath;
    if (isGeneratedVispReviewFile(parsedPath.value)) continue;
    const absolutePath = path.join(targetPath, parsedPath.value);
    let bytes: Buffer;
    let mode: string;
    try {
      const stats = await lstat(absolutePath);
      mode = stats.isSymbolicLink() ? "120000" : (stats.mode & 0o111) !== 0 ? "100755" : "100644";
      bytes = stats.isSymbolicLink()
        ? Buffer.from(await readlink(absolutePath), "utf8")
        : await readFile(absolutePath);
    } catch (error) {
      return err(
        new VispError("FILE_SYSTEM_ERROR", `Unable to capture untracked file ${rawPath}.`, {
          cause: error
        })
      );
    }
    const modeDetail = `untracked-mode:${mode}\n`;
    units.push({
      kind: "file",
      layer: "untracked",
      category: "mode",
      detail: modeDetail,
      detailSha256: hashOracleText(modeDetail),
      afterPath: parsedPath.value,
      afterMode: mode
    });

    let contents: string | undefined;
    try {
      contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      contents = undefined;
    }
    if (contents === undefined || bytes.includes(0)) {
      const detail = `base64:${bytes.toString("base64")}`;
      units.push({
        kind: "file",
        layer: "untracked",
        category: "binary",
        detail,
        detailSha256: hashOracleText(detail),
        afterPath: parsedPath.value
      });
      continue;
    }

    const normalized = normalizedText(contents);
    if (normalized.length === 0) {
      const detail = "untracked-empty\n";
      units.push({
        kind: "file",
        layer: "untracked",
        category: "empty",
        detail,
        detailSha256: hashOracleText(detail),
        afterPath: parsedPath.value
      });
      continue;
    }
    const terminated = normalized.endsWith("\n");
    const lines = normalized.split("\n");
    if (terminated) lines.pop();
    const patch = `@@ -0,0 +1,${lines.length} @@\n${lines.map((line) => `+${line}`).join("\n")}\n${
      terminated ? "" : "\\ No newline at end of file\n"
    }`;
    units.push({
      kind: "hunk",
      layer: "untracked",
      path: parsedPath.value,
      oldStart: 0,
      oldLines: 0,
      newStart: 1,
      newLines: lines.length,
      patch,
      patchSha256: hashOracleText(patch)
    });
  }
  return ok(units);
}

function comparePending(left: PendingUnit, right: PendingUnit): number {
  const leftPath = left.kind === "hunk" ? left.path : (left.afterPath ?? left.beforePath ?? "");
  const rightPath =
    right.kind === "hunk" ? right.path : (right.afterPath ?? right.beforePath ?? "");
  return (
    compareUtf16CodeUnits(leftPath, rightPath) ||
    compareUtf16CodeUnits(left.kind, right.kind) ||
    compareUtf16CodeUnits(left.layer, right.layer) ||
    compareUtf16CodeUnits(
      left.kind === "hunk" ? left.patchSha256 : left.detailSha256,
      right.kind === "hunk" ? right.patchSha256 : right.detailSha256
    )
  );
}

function finalizeUnits(units: readonly PendingUnit[]): DiffSnapshotChangeUnit[] {
  const occurrences = new Map<string, number>();
  const finalized = [...units].sort(comparePending).map((unit) => {
    if (unit.kind === "file") {
      const provisional = { ...unit, id: "CU-provisional" };
      return { ...unit, id: createDiffSnapshotChangeUnitId(provisional) };
    }
    const key = `${unit.path}\0${unit.patchSha256}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    const provisional = { ...unit, id: "CU-provisional", occurrence };
    return { ...unit, id: createDiffSnapshotChangeUnitId(provisional), occurrence };
  });
  return finalized.sort((left, right) => compareUtf16CodeUnits(left.id, right.id));
}

async function gitOutput(
  runner: CommandRunner,
  targetPath: string,
  args: readonly string[]
): Promise<Result<string, VispError>> {
  const result = await runner.run("git", ["-c", "core.quotepath=false", ...args], {
    cwd: targetPath
  });
  if (!result.ok) return result;
  return result.value.exitCode === 0
    ? ok(result.value.stdout)
    : err(
        new VispError(
          "COMMAND_FAILED",
          `Git command failed: git ${args.join(" ")}: ${result.value.stderr}`
        )
      );
}

async function resolveRevision(
  runner: CommandRunner,
  targetPath: string,
  revision: string
): Promise<Result<string, VispError>> {
  const result = await gitOutput(runner, targetPath, [
    "rev-parse",
    "--verify",
    `${revision}^{commit}`
  ]);
  return result.ok ? ok(result.value.trim()) : result;
}

async function gitStructure(
  runner: CommandRunner,
  targetPath: string
): Promise<
  Result<{ readonly headRevision: string; readonly indexTreeRevision: string }, VispError>
> {
  const [head, indexTree] = await Promise.all([
    resolveRevision(runner, targetPath, "HEAD"),
    gitOutput(runner, targetPath, ["write-tree"])
  ]);
  if (!head.ok) return head;
  if (!indexTree.ok) return indexTree;
  const tree = indexTree.value.trim();
  if (!/^[a-f0-9]{40,64}$/u.test(tree)) {
    return err(new VispError("VALIDATION_FAILED", "Git index tree identity is malformed."));
  }
  return ok({ headRevision: head.value, indexTreeRevision: tree });
}

async function workspaceFingerprint(
  runner: CommandRunner,
  targetPath: string
): Promise<Result<string, VispError>> {
  const status = await gitOutput(runner, targetPath, [
    "status",
    "--porcelain=v2",
    "-z",
    "--untracked-files=all"
  ]);
  if (!status.ok) return status;
  const staged = await gitOutput(runner, targetPath, [
    "diff",
    "--binary",
    "--full-index",
    "--cached",
    "HEAD",
    "--"
  ]);
  if (!staged.ok) return staged;
  const unstaged = await gitOutput(runner, targetPath, ["diff", "--binary", "--full-index", "--"]);
  if (!unstaged.ok) return unstaged;
  const untracked = await listGitUntrackedFiles({ targetPath, commandRunner: runner });
  if (!untracked.ok) return untracked;
  const untrackedContents: Array<{ path: string; content: string }> = [];
  for (const rawPath of untracked.value) {
    const parsedPath = safePath(rawPath);
    if (!parsedPath.ok) return parsedPath;
    try {
      const absolutePath = path.join(targetPath, parsedPath.value);
      const stats = await lstat(absolutePath);
      const bytes = stats.isSymbolicLink()
        ? Buffer.from(await readlink(absolutePath), "utf8")
        : await readFile(absolutePath);
      untrackedContents.push({
        path: parsedPath.value,
        content: bytes.toString("base64")
      });
    } catch (error) {
      return err(
        new VispError("FILE_SYSTEM_ERROR", `Unable to fingerprint untracked file ${rawPath}.`, {
          cause: error
        })
      );
    }
  }
  return ok(
    hashOracleValue({
      status: normalizedText(status.value),
      staged: normalizedText(staged.value),
      unstaged: normalizedText(unstaged.value),
      untracked: untrackedContents
    })
  );
}

async function captureLayer(
  runner: CommandRunner,
  targetPath: string,
  layer: SnapshotLayer,
  args: readonly string[]
): Promise<Result<PendingUnit[], VispError>> {
  const [patch, status] = await Promise.all([
    gitOutput(runner, targetPath, ["diff", ...diffFlags, ...args, "--"]),
    gitOutput(runner, targetPath, ["diff", "--name-status", "-z", "--find-renames", ...args, "--"])
  ]);
  if (!patch.ok) return patch;
  if (!status.ok) return status;
  return parseLayer({ layer, nameStatus: status.value, patch: patch.value });
}

export async function captureDiffSnapshot(
  input: CaptureDiffSnapshotInput
): Promise<Result<DiffSnapshot, VispError>> {
  const runner = input.commandRunner ?? defaultCommandRunner;
  const base = await resolveRevision(runner, input.targetPath, input.baseRevision);
  if (!base.ok) return base;
  const units: PendingUnit[] = [];
  let targetRevision: string;
  let structure: { readonly headRevision: string; readonly indexTreeRevision: string } | undefined;

  if (input.mode === "base_to_commit") {
    if (input.targetRevision === undefined) {
      return err(
        new VispError("VALIDATION_FAILED", "Committed diff capture requires targetRevision.")
      );
    }
    const target = await resolveRevision(runner, input.targetPath, input.targetRevision);
    if (!target.ok) return target;
    targetRevision = target.value;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const before = await gitStructure(runner, input.targetPath);
      if (!before.ok) return before;
      const committed = await captureLayer(runner, input.targetPath, "committed", [
        base.value,
        target.value
      ]);
      if (!committed.ok) return committed;
      const after = await gitStructure(runner, input.targetPath);
      if (!after.ok) return after;
      if (canonicalJsonV1(before.value) === canonicalJsonV1(after.value)) {
        units.push(...committed.value);
        structure = before.value;
        break;
      }
    }
  } else {
    targetRevision = "WORKSPACE";
    let stableUnits: PendingUnit[] | undefined;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const structureBefore = await gitStructure(runner, input.targetPath);
      if (!structureBefore.ok) return structureBefore;
      const before = await workspaceFingerprint(runner, input.targetPath);
      if (!before.ok) return before;
      const [staged, unstaged, untracked] = await Promise.all([
        captureLayer(runner, input.targetPath, "staged", ["--cached", base.value]),
        captureLayer(runner, input.targetPath, "unstaged", []),
        listGitUntrackedFiles({ targetPath: input.targetPath, commandRunner: runner })
      ]);
      if (!staged.ok) return staged;
      if (!unstaged.ok) return unstaged;
      if (!untracked.ok) return untracked;
      const capturedUntracked = await untrackedUnits(input.targetPath, untracked.value);
      if (!capturedUntracked.ok) return capturedUntracked;
      const after = await workspaceFingerprint(runner, input.targetPath);
      if (!after.ok) return after;
      const structureAfter = await gitStructure(runner, input.targetPath);
      if (!structureAfter.ok) return structureAfter;
      if (
        before.value === after.value &&
        canonicalJsonV1(structureBefore.value) === canonicalJsonV1(structureAfter.value)
      ) {
        stableUnits = [...staged.value, ...unstaged.value, ...capturedUntracked.value];
        structure = structureBefore.value;
        break;
      }
    }
    if (stableUnits === undefined) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          "Workspace changed repeatedly during diff capture; no atomic snapshot was produced."
        )
      );
    }
    units.push(...stableUnits);
  }

  if (structure === undefined) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Git HEAD or index changed repeatedly during diff capture."
      )
    );
  }
  const changeUnits = finalizeUnits(units);
  const stateMaterial = {
    ...structure,
    implementationSha256: hashOracleValue(changeUnits)
  };
  const withoutHash = {
    version: "1.0" as const,
    mode: input.mode,
    baseRevision: base.value,
    targetRevision,
    state: {
      ...stateMaterial,
      stateSha256: hashOracleValue(stateMaterial)
    },
    changeUnits
  };
  const snapshot = {
    ...withoutHash,
    snapshotSha256: hashOracleValue(withoutHash)
  };
  const parsed = diffSnapshotSchema.safeParse(snapshot);
  return parsed.success
    ? ok(parsed.data)
    : err(
        new VispError(
          "VALIDATION_FAILED",
          `Invalid diff snapshot: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
        )
      );
}

export function assuranceChangeUnits(
  snapshot: DiffSnapshot
): AssuranceCaseWithoutHash["changeUnits"] {
  return snapshot.changeUnits.map((unit) => {
    if (unit.kind === "hunk") {
      const { layer: _layer, patch: _patch, ...changeUnit } = unit;
      return changeUnit;
    }
    const { layer: _layer, detail: _detail, ...changeUnit } = unit;
    return changeUnit;
  });
}
