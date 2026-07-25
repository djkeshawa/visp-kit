import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, readFile, readlink } from "node:fs/promises";
import path from "node:path";

import { type CandidateWorkspace } from "../artifacts/schemas/candidate-evidence.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { defaultCommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { isGeneratedVispReviewFile } from "../review/diff-summary.js";
import { getGitChangedFiles } from "../verification/git-diff.js";
import { compareUtf16CodeUnits } from "../integration/canonical-json.js";

function normalizeProjectPath(value: string): string | undefined {
  const normalized = value.replaceAll("\\", "/");
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
  ].sort(compareUtf16CodeUnits);

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

function gitBlob(
  targetPath: string,
  revision: string,
  filePath: string
): Promise<Result<Buffer, VispError>> {
  return new Promise((resolve) => {
    const child = spawn("git", ["show", `${revision}:${filePath}`], {
      cwd: targetPath,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.once("error", (error) =>
      resolve(
        err(
          new VispError("COMMAND_FAILED", `Unable to read committed blob ${filePath}.`, {
            cause: error
          })
        )
      )
    );
    child.once("close", (exitCode) => {
      if (exitCode === 0) {
        resolve(ok(Buffer.concat(stdout)));
      } else {
        resolve(
          err(
            new VispError(
              "COMMAND_FAILED",
              `Unable to read committed blob ${filePath}: ${Buffer.concat(stderr).toString("utf8")}`
            )
          )
        );
      }
    });
  });
}

export async function createCommittedCandidateFingerprint(input: {
  readonly targetPath: string;
  readonly baseRevision: string;
  readonly targetRevision: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<CandidateWorkspace, VispError>> {
  const runner = input.commandRunner ?? defaultCommandRunner;
  const resolveRevision = async (revision: string): Promise<Result<string, VispError>> => {
    const resolved = await runner.run("git", ["rev-parse", "--verify", `${revision}^{commit}`], {
      cwd: input.targetPath
    });
    if (!resolved.ok) return resolved;
    const commit = resolved.value.stdout.trim();
    return resolved.value.exitCode === 0 && /^[a-f0-9]{40,64}$/u.test(commit)
      ? ok(commit)
      : err(new VispError("VALIDATION_FAILED", `Invalid commit revision: ${revision}.`));
  };
  const base = await resolveRevision(input.baseRevision);
  if (!base.ok) return base;
  const target = await resolveRevision(input.targetRevision);
  if (!target.ok) return target;
  const changed = await runner.run(
    "git",
    ["diff", "--name-only", "-z", "--find-renames", base.value, target.value],
    { cwd: input.targetPath }
  );
  if (!changed.ok) return changed;
  if (changed.value.exitCode !== 0) {
    return err(new VispError("COMMAND_FAILED", "Unable to list committed candidate paths."));
  }
  const paths = [
    ...new Set(changed.value.stdout.split("\0").filter((value) => value.length > 0))
  ].sort(compareUtf16CodeUnits);
  const files: Array<CandidateWorkspace["files"][number]> = [];
  for (const filePath of paths) {
    const normalized = normalizeProjectPath(filePath);
    if (normalized === undefined) {
      return err(new VispError("VALIDATION_FAILED", `Unsafe committed path: ${filePath}.`));
    }
    if (isGeneratedVispReviewFile(normalized)) continue;
    const tree = await runner.run("git", ["ls-tree", target.value, "--", normalized], {
      cwd: input.targetPath
    });
    if (!tree.ok) return tree;
    const mode = /^([0-7]{6})\s/u.exec(tree.value.stdout)?.[1];
    if (tree.value.exitCode !== 0) {
      return err(
        new VispError("COMMAND_FAILED", `Unable to inspect committed path ${normalized}.`)
      );
    }
    if (mode === undefined) {
      files.push({ path: normalized, state: "missing" });
      continue;
    }
    const blob =
      input.commandRunner === undefined
        ? await gitBlob(input.targetPath, target.value, normalized)
        : await runner
            .run("git", ["show", `${target.value}:${normalized}`], {
              cwd: input.targetPath
            })
            .then((result) =>
              result.ok && result.value.exitCode === 0
                ? ok(Buffer.from(result.value.stdout, "utf8"))
                : err(
                    result.ok
                      ? new VispError(
                          "COMMAND_FAILED",
                          `Unable to read committed blob ${normalized}.`
                        )
                      : result.error
                  )
            );
    if (!blob.ok) return blob;
    files.push({
      path: normalized,
      state: "present",
      sha256: `sha256:${createHash("sha256").update(blob.value).digest("hex")}`,
      executable: mode === "100755"
    });
  }
  const material = {
    version: "1.0" as const,
    mode: "git_changed" as const,
    files
  };
  return ok({ ...material, hash: hashOracleValue(material) });
}
