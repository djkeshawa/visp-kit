import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryStoreDetected } from "../../../src/agent/memory-detection.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

describe("memory store detection", () => {
  let tempDir: string;
  let projectDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-memory-detect-"));
    projectDir = path.join(tempDir, "packages", "app");
    await mkdir(projectDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports no memory in a project without a store", async () => {
    expect(expectOk(await memoryStoreDetected(projectDir))).toBe(false);
  });

  it("detects a YAML store in the project directory", async () => {
    await writeFile(path.join(projectDir, "visp-memory.yaml"), "repo_id: app\n", "utf8");

    expect(expectOk(await memoryStoreDetected(projectDir))).toBe(true);
  });

  it("detects the JSON form of the same config", async () => {
    await writeFile(path.join(projectDir, "visp-memory.json"), '{"repo_id":"app"}\n', "utf8");

    expect(expectOk(await memoryStoreDetected(projectDir))).toBe(true);
  });

  it("detects a store directory config", async () => {
    await mkdir(path.join(projectDir, ".visp-memory"));
    await writeFile(path.join(projectDir, ".visp-memory", "config.yaml"), "repo_id: app\n", "utf8");

    expect(expectOk(await memoryStoreDetected(projectDir))).toBe(true);
  });

  it("finds a store configured in an ancestor directory", async () => {
    // visp-memory resolves its config by walking up, so a monorepo store at the
    // repository root serves a package several levels down.
    await writeFile(path.join(tempDir, "visp-memory.yaml"), "repo_id: monorepo\n", "utf8");

    expect(expectOk(await memoryStoreDetected(projectDir))).toBe(true);
  });

  it("stops at the filesystem root rather than looping", async () => {
    expect(expectOk(await memoryStoreDetected(path.parse(tempDir).root))).toBe(false);
  });
});
