import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pathExists } from "../../../src/core/file-system.js";
import { isErr } from "../../../src/core/result.js";
import { runConstitutionWorkflow } from "../../../src/workflows/constitution.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initializedProject(tempDir: string): Promise<void> {
  expectOk(
    await runInitWorkflow({
      targetPath: tempDir,
      agent: "none",
      preset: "typescript",
      budget: "lean",
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

describe("runConstitutionWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-constitution-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails clearly when .visp is missing", async () => {
    const result = await runConstitutionWorkflow({ targetPath: tempDir });

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.message).toContain("visp-kit init");
    }
  });

  it("creates constitution files when they do not exist", async () => {
    await mkdir(path.join(tempDir, ".visp"), { recursive: true });

    const summary = expectOk(
      await runConstitutionWorkflow({
        targetPath: tempDir,
        preset: "typescript",
        budget: "lean",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(summary.createdFiles).toEqual([
      ".visp/memory/constitution.md",
      ".visp/memory/constitution.compact.md"
    ]);
    expect(summary.validation.passed).toBe(true);
    expect(
      await readFile(path.join(tempDir, ".visp", "memory", "constitution.md"), "utf8")
    ).toContain("explicit types");
  });

  it("uses config preset and budget by default", async () => {
    await initializedProject(tempDir);
    await rm(path.join(tempDir, ".visp", "memory", "constitution.md"));
    await rm(path.join(tempDir, ".visp", "memory", "constitution.compact.md"));

    const summary = expectOk(await runConstitutionWorkflow({ targetPath: tempDir }));

    expect(summary.preset).toBe("typescript");
    expect(summary.budget).toBe("lean");
  });

  it("skips existing constitution files without force", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runConstitutionWorkflow({ targetPath: tempDir, preset: "react" })
    );

    expect(summary.skippedFiles).toEqual([
      ".visp/memory/constitution.md",
      ".visp/memory/constitution.compact.md"
    ]);
    expect(summary.validation.passed).toBe(true);
  });

  it("overwrites existing constitution files with force", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runConstitutionWorkflow({
        targetPath: tempDir,
        preset: "electron",
        budget: "strict",
        force: true
      })
    );
    const full = await readFile(path.join(tempDir, ".visp", "memory", "constitution.md"), "utf8");

    expect(summary.overwrittenFiles).toContain(".visp/memory/constitution.md");
    expect(full).toContain("unsafe IPC");
    expect(full).toContain("stronger validation");
  });

  it("dry-run writes nothing", async () => {
    await mkdir(path.join(tempDir, ".visp"), { recursive: true });

    const summary = expectOk(await runConstitutionWorkflow({ targetPath: tempDir, dryRun: true }));

    expect(summary.dryRun).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "memory"))).toBe(false);
  });

  it("validates existing compact constitution without rewriting", async () => {
    await initializedProject(tempDir);

    const summary = expectOk(
      await runConstitutionWorkflow({ targetPath: tempDir, validate: true })
    );

    expect(summary.createdFiles).toEqual([]);
    expect(summary.validation.passed).toBe(true);
  });

  it("reports validation failures for duplicate compact rule IDs", async () => {
    await initializedProject(tempDir);
    await writeFile(
      path.join(tempDir, ".visp", "memory", "constitution.compact.md"),
      "C001: One.\nC001: One.\n",
      "utf8"
    );

    const summary = expectOk(
      await runConstitutionWorkflow({ targetPath: tempDir, validate: true })
    );

    expect(summary.success).toBe(false);
    expect(summary.validation.errors).toContain("Duplicate rule ID C001.");
  });
});
