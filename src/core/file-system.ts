import { randomUUID } from "node:crypto";
import {
  access,
  type FileHandle,
  link,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  realpath,
  rename,
  rm,
  rmdir,
  stat
} from "node:fs/promises";
import path from "node:path";

import { VispError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

type NodeError = Error & {
  readonly code?: string;
};

function isNodeError(error: unknown): error is NodeError {
  return error instanceof Error;
}

function fileSystemError(error: unknown, message: string, filePath: string): VispError {
  const code =
    isNodeError(error) && error.code === "ENOENT" ? "FILE_NOT_FOUND" : "FILE_SYSTEM_ERROR";

  return new VispError(code, message, {
    cause: error,
    details: { path: filePath }
  });
}

async function existingFileMode(filePath: string): Promise<number | undefined> {
  try {
    // 0o7777, not 0o777: rename installs a new inode, so setuid, setgid and the
    // sticky bit are only preserved if they are carried across explicitly. The
    // in-place write this replaced kept them for free.
    return (await stat(filePath)).mode & 0o7777;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function resolveAtomicWritePath(filePath: string): Promise<string> {
  let candidatePath = path.resolve(filePath);
  const visitedLinks = new Set<string>();

  while (true) {
    let info: Awaited<ReturnType<typeof lstat>>;
    try {
      info = await lstat(candidatePath);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return candidatePath;
      throw error;
    }

    if (!info.isSymbolicLink()) return candidatePath;
    if (visitedLinks.has(candidatePath) || visitedLinks.size >= 40) {
      throw Object.assign(new Error(`Too many symbolic links while resolving ${filePath}.`), {
        code: "ELOOP"
      });
    }
    visitedLinks.add(candidatePath);
    const target = await readlink(candidatePath);
    const targetParent = path.isAbsolute(target)
      ? path.dirname(candidatePath)
      : await realpath(path.dirname(candidatePath));
    candidatePath = path.resolve(targetParent, target);
  }
}

async function bestEffortSyncDirectory(dirPath: string): Promise<void> {
  if (process.platform === "win32") return;

  let directory: FileHandle | undefined;
  try {
    directory = await open(dirPath, "r");
    await directory.sync();
  } catch {
    // The rename has committed. Directory sync support varies by filesystem,
    // so a durability hint must not report a false write failure after commit.
  } finally {
    await directory?.close().catch(() => undefined);
  }
}

async function writeSyncedTemporaryFile(
  temporaryPath: string,
  contents: string,
  mode?: number
): Promise<void> {
  const temporaryFile = await open(temporaryPath, "wx", mode ?? 0o666);

  try {
    if (mode !== undefined) {
      await temporaryFile.chmod(mode);
    }
    await temporaryFile.writeFile(contents, "utf8");
    await temporaryFile.sync();
  } finally {
    await temporaryFile.close();
  }
}

function temporarySiblingPath(filePath: string): string {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  );
}

export async function pathExists(targetPath: string): Promise<Result<boolean, VispError>> {
  try {
    await access(targetPath);
    return ok(true);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return ok(false);
    }

    return err(fileSystemError(error, `Unable to access ${targetPath}.`, targetPath));
  }
}

export async function ensureDir(dirPath: string): Promise<Result<string, VispError>> {
  try {
    await mkdir(dirPath, { recursive: true });
    return ok(dirPath);
  } catch (error) {
    return err(fileSystemError(error, `Unable to create ${dirPath}.`, dirPath));
  }
}

export async function readTextFile(filePath: string): Promise<Result<string, VispError>> {
  try {
    return ok(await readFile(filePath, "utf8"));
  } catch (error) {
    return err(fileSystemError(error, `Unable to read ${filePath}.`, filePath));
  }
}

export async function writeTextFile(
  filePath: string,
  contents: string
): Promise<Result<string, VispError>> {
  let writePath = filePath;
  let temporaryPath: string | undefined;

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    writePath = await resolveAtomicWritePath(filePath);
    const directoryPath = path.dirname(writePath);
    temporaryPath = temporarySiblingPath(writePath);
    const mode = await existingFileMode(writePath);
    await writeSyncedTemporaryFile(temporaryPath, contents, mode);

    await rename(temporaryPath, writePath);
    await bestEffortSyncDirectory(directoryPath);
    return ok(filePath);
  } catch (error) {
    if (temporaryPath !== undefined) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }

    return err(fileSystemError(error, `Unable to write ${filePath}.`, filePath));
  }
}

export type ExclusiveFileIdentity = {
  readonly device: number;
  readonly inode: number;
};

export type ExclusiveFileWrite = {
  readonly path: string;
  readonly identity: ExclusiveFileIdentity;
};

export type ExclusiveDirectoryLockIdentity = {
  readonly device: number;
  readonly inode: number;
};

async function directoryIdentityMatches(
  directoryPath: string,
  identity: ExclusiveDirectoryLockIdentity
): Promise<boolean> {
  try {
    const current = await lstat(directoryPath);
    return (
      current.isDirectory() &&
      !current.isSymbolicLink() &&
      current.dev === identity.device &&
      current.ino === identity.inode
    );
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

async function releaseExclusiveDirectoryLock(
  lockPath: string,
  ownerPath: string,
  identity: ExclusiveDirectoryLockIdentity
): Promise<void> {
  try {
    if (!(await directoryIdentityMatches(lockPath, identity))) return;

    // The owner filename contains an unguessable acquisition ID. If somebody
    // replaces the directory after the identity check, this unlink cannot
    // remove their differently named owner entry, and rmdir cannot remove
    // their nonempty lock directory.
    await rm(ownerPath, { force: true });
    if (!(await directoryIdentityMatches(lockPath, identity))) return;
    await rmdir(lockPath);
  } catch {
    // The protected operation has already completed. A failed cleanup leaves
    // a visible lock for the documented explicit recovery procedure rather
    // than risking deletion of an entry owned by another process.
  }
}

async function directoryEntryExists(entryPath: string): Promise<boolean> {
  try {
    await lstat(entryPath);
    return true;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Runs an operation while holding an exclusive, crash-visible directory lock.
 *
 * The complete nonempty lock directory is renamed into place atomically. Its
 * unique owner entry makes cleanup safe even if an operator removes a stale
 * lock and a successor acquires the same pathname before the old holder exits.
 */
export async function withExclusiveDirectoryLock<T>(
  lockPath: string,
  operationName: string,
  operation: () => Promise<Result<T, VispError>>
): Promise<Result<T, VispError>> {
  const acquisitionId = randomUUID();
  const parentPath = path.dirname(lockPath);
  const candidatePath = path.join(
    parentPath,
    `.${path.basename(lockPath)}.${process.pid}.${acquisitionId}.candidate`
  );
  const ownerName = `owner-${process.pid}-${acquisitionId}.json`;
  const candidateOwnerPath = path.join(candidatePath, ownerName);
  const lockOwnerPath = path.join(lockPath, ownerName);
  let acquiredIdentity: ExclusiveDirectoryLockIdentity | undefined;
  let published = false;

  try {
    await mkdir(parentPath, { recursive: true });
    await mkdir(candidatePath);
    const owner = await open(candidateOwnerPath, "wx");
    try {
      await owner.writeFile(
        `${JSON.stringify({ version: "1.0", pid: process.pid, acquisitionId, acquiredAt: new Date().toISOString() }, null, 2)}\n`,
        "utf8"
      );
      await owner.sync();
    } finally {
      await owner.close();
    }

    const candidate = await lstat(candidatePath);
    if (!candidate.isDirectory() || candidate.isSymbolicLink()) {
      throw new Error("Exclusive lock candidate must be a directory.");
    }
    acquiredIdentity = { device: candidate.dev, inode: candidate.ino };
    await rename(candidatePath, lockPath);
    published = true;
    if (!(await directoryIdentityMatches(lockPath, acquiredIdentity))) {
      throw new Error("Exclusive lock changed while it was being acquired.");
    }

    return await operation();
  } catch (error) {
    if (!published && (await directoryEntryExists(lockPath).catch(() => false))) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Another ${operationName} is in progress. Lock: ${lockPath}. ` +
            "If no such process is running, remove only this exact stale lock entry and retry."
        )
      );
    }
    return err(fileSystemError(error, `Unable to acquire ${operationName} lock.`, lockPath));
  } finally {
    if (published && acquiredIdentity !== undefined) {
      await releaseExclusiveDirectoryLock(lockPath, lockOwnerPath, acquiredIdentity);
    } else {
      await rm(candidatePath, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

/**
 * The ownership-bearing form of {@link writeTextFileExclusive}. Callers that
 * may roll a create back can compare this identity before removing the entry,
 * so they never delete a concurrent replacement.
 */
export async function writeTextFileExclusiveWithIdentity(
  filePath: string,
  contents: string
): Promise<Result<ExclusiveFileWrite, VispError>> {
  let temporaryPath: string | undefined;

  try {
    const directoryPath = path.dirname(filePath);
    await mkdir(directoryPath, { recursive: true });
    temporaryPath = temporarySiblingPath(filePath);
    await writeSyncedTemporaryFile(temporaryPath, contents);
    const temporaryIdentity = await stat(temporaryPath);
    await link(temporaryPath, filePath);

    // The destination now names the complete, flushed inode. Cleanup and
    // directory durability are best effort after that atomic commit point.
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    await bestEffortSyncDirectory(directoryPath);
    return ok({
      path: filePath,
      identity: {
        device: temporaryIdentity.dev,
        inode: temporaryIdentity.ino
      }
    });
  } catch (error) {
    if (temporaryPath !== undefined) {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
    return err(fileSystemError(error, `Unable to write ${filePath}.`, filePath));
  }
}

/**
 * Atomically creates a new file without replacing an existing directory entry.
 * The fully written temporary inode is linked into place only after it is
 * flushed, preserving the create-exclusive contract without exposing partial
 * bytes at the final path.
 */
export async function writeTextFileExclusive(
  filePath: string,
  contents: string
): Promise<Result<string, VispError>> {
  const written = await writeTextFileExclusiveWithIdentity(filePath, contents);
  return written.ok ? ok(written.value.path) : written;
}

export async function removeFile(filePath: string): Promise<Result<void, VispError>> {
  try {
    await rm(filePath, { force: true });
    return ok(undefined);
  } catch (error) {
    return err(fileSystemError(error, `Unable to remove ${filePath}.`, filePath));
  }
}

export async function readJsonFile<T = unknown>(filePath: string): Promise<Result<T, VispError>> {
  const text = await readTextFile(filePath);

  if (!text.ok) {
    return text;
  }

  try {
    return ok(JSON.parse(text.value) as T);
  } catch (error) {
    return err(
      new VispError("VALIDATION_FAILED", `Unable to parse JSON in ${filePath}.`, {
        cause: error,
        details: { path: filePath }
      })
    );
  }
}

export async function writeJsonFile(
  filePath: string,
  value: unknown
): Promise<Result<string, VispError>> {
  const serialized = JSON.stringify(value, null, 2);

  if (serialized === undefined) {
    return err(
      new VispError("VALIDATION_FAILED", "Value cannot be serialized to JSON.", {
        details: { path: filePath }
      })
    );
  }

  return writeTextFile(filePath, `${serialized}\n`);
}
