import { createHash } from "node:crypto";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

import { type CandidateWorkspace } from "../artifacts/schemas/candidate-evidence.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { isGeneratedVispReviewFile } from "../review/diff-summary.js";
import { getGitChangedFiles } from "../verification/git-diff.js";

function normalizeProjectPath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/").trim();
  const segments = normalized.split("/");
  if (
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return undefined;
  }
  const compact = segments.filter((segment) => segment.length > 0).join("/");
  return compact.length === 0 ? undefined : compact;
}

async function fingerprintFile(
  targetPath: string,
  filePath: string
): Promise<CandidateWorkspace["files"][number]> {
  const absolutePath = path.join(targetPath, ...filePath.split("/"));
  try {
    const metadata = await lstat(absolutePath);
    const bytes = metadata.isSymbolicLink()
      ? Buffer.from(await readlink(absolutePath), "utf8")
      : await readFile(absolutePath);
    if (!metadata.isFile() && !metadata.isSymbolicLink()) {
      throw new VispError(
        "VALIDATION_FAILED",
        `Candidate workspace path is not a regular file: ${filePath}.`
      );
    }
    return {
      path: filePath,
      state: "present",
      sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      executable: (metadata.mode & 0o111) !== 0
    };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return { path: filePath, state: "missing" };
    }
    throw error;
  }
}

export async function createCandidateWorkspaceFingerprint(input: {
  readonly targetPath: string;
  readonly task: Pick<Task, "allowedFiles" | "expectedFiles">;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<CandidateWorkspace, VispError>> {
  const git = await getGitChangedFiles({
    targetPath: input.targetPath,
    commandRunner: input.commandRunner
  });
  const useGit = git.warnings.length === 0 && git.errors.length === 0;
  const candidates = useGit
    ? git.changedFiles
    : [...input.task.allowedFiles, ...(input.task.expectedFiles ?? [])];
  const normalizedCandidates = candidates.map(normalizeProjectPath);
  if (normalizedCandidates.some((value) => value === undefined)) {
    return err(
      new VispError("VALIDATION_FAILED", "Candidate workspace contains an unsafe project path.")
    );
  }
  const normalized = [
    ...new Set(
      (normalizedCandidates as string[]).filter((value) => !isGeneratedVispReviewFile(value))
    )
  ].sort();

  try {
    const files = await Promise.all(
      normalized.map((filePath) => fingerprintFile(input.targetPath, filePath))
    );
    const material = {
      version: "1.0" as const,
      mode: useGit ? ("git_changed" as const) : ("task_scope_fallback" as const),
      files
    };
    return ok({
      ...material,
      hash: hashOracleValue(material)
    });
  } catch (error) {
    return err(
      error instanceof VispError
        ? error
        : new VispError(
            "VALIDATION_FAILED",
            `Candidate workspace fingerprint failed: ${error instanceof Error ? error.message : String(error)}.`
          )
    );
  }
}
