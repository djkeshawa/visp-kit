import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ensureDir,
  pathExists,
  readJsonFile,
  readTextFile,
  writeJsonFile,
  writeTextFile
} from "../../src/core/file-system.js";
import { isErr, isOk } from "../../src/core/result.js";

describe("filesystem helpers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-fs-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates directories", async () => {
    const dirPath = path.join(tempDir, "nested", "dir");
    const result = await ensureDir(dirPath);

    expect(result).toEqual({ ok: true, value: dirPath });
    expect(await pathExists(dirPath)).toEqual({ ok: true, value: true });
  });

  it("writes and reads text files", async () => {
    const filePath = path.join(tempDir, "notes", "phase-1.txt");

    const writeResult = await writeTextFile(filePath, "calm output");
    const readResult = await readTextFile(filePath);

    expect(writeResult).toEqual({ ok: true, value: filePath });
    expect(readResult).toEqual({ ok: true, value: "calm output" });
  });

  it("writes and reads pretty JSON files", async () => {
    const filePath = path.join(tempDir, ".visp", "config.json");
    const value = { name: "visp-kit", enabled: true };

    const writeResult = await writeJsonFile(filePath, value);
    const readResult = await readJsonFile<typeof value>(filePath);
    const raw = await readFile(filePath, "utf8");

    expect(writeResult).toEqual({ ok: true, value: filePath });
    expect(readResult).toEqual({ ok: true, value });
    expect(raw).toBe('{\n  "name": "visp-kit",\n  "enabled": true\n}\n');
  });

  it("returns false when a path does not exist", async () => {
    const missingPath = path.join(tempDir, "missing.txt");

    expect(await pathExists(missingPath)).toEqual({ ok: true, value: false });
  });

  it("returns a clear error for missing text files", async () => {
    const result = await readTextFile(path.join(tempDir, "missing.txt"));

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
    }
  });

  it("returns a validation error for invalid JSON", async () => {
    const filePath = path.join(tempDir, "invalid.json");
    await writeFile(filePath, "{", "utf8");

    const result = await readJsonFile(filePath);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });

  it("rejects values that cannot be serialized as JSON", async () => {
    const result = await writeJsonFile(path.join(tempDir, "bad.json"), undefined);

    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
    }
  });
});
