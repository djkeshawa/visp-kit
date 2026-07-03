import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents, "utf8");
    return ok(filePath);
  } catch (error) {
    return err(fileSystemError(error, `Unable to write ${filePath}.`, filePath));
  }
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
