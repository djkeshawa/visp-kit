import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { memoryStoreManifest, memoryToolingDetected } from "../../../src/agent/memory-detection.js";

describe("memory tooling detection", () => {
  let tempDir: string;
  let projectDir: string;
  let binDir: string;
  let originalPath: string | undefined;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-memory-detect-"));
    projectDir = path.join(tempDir, "project");
    binDir = path.join(tempDir, "bin");
    await mkdir(projectDir);
    await mkdir(binDir);
    originalPath = process.env["PATH"];
    process.env["PATH"] = binDir;
  });

  afterEach(async () => {
    if (originalPath === undefined) delete process.env["PATH"];
    else process.env["PATH"] = originalPath;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports no memory in a project with neither a store nor the CLI", async () => {
    expect(await memoryToolingDetected(projectDir)).toBe(false);
  });

  it("detects a project that already carries a memory store", async () => {
    await writeFile(path.join(projectDir, memoryStoreManifest), "version: 1\n", "utf8");

    expect(await memoryToolingDetected(projectDir)).toBe(true);
  });

  it("detects the CLI on PATH before the project has a store", async () => {
    // Bootstrapping Kit before `visp-memory init` is the ordinary order, so an
    // installed CLI has to count on its own.
    const executable = path.join(
      binDir,
      process.platform === "win32" ? "visp-memory.cmd" : "visp-memory"
    );
    await writeFile(executable, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(executable, 0o755);

    expect(await memoryToolingDetected(projectDir)).toBe(true);
  });

  // Windows grants X_OK to any readable file, so the negative case is POSIX-only.
  it.skipIf(process.platform === "win32")(
    "does not count a non-executable file of the same name",
    async () => {
      const notExecutable = path.join(binDir, "visp-memory");
      await writeFile(notExecutable, "not a program\n", "utf8");
      await chmod(notExecutable, 0o644);

      expect(await memoryToolingDetected(projectDir)).toBe(false);
    }
  );

  it("survives an empty PATH", async () => {
    process.env["PATH"] = "";

    expect(await memoryToolingDetected(projectDir)).toBe(false);
  });
});
