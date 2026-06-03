import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pathExists } from "../../../src/core/file-system.js";
import { applySafeDoctorFixes } from "../../../src/doctor/doctor-fixes.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok.");
  return result.value;
}

describe("doctor fixes", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-doctor-fix-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates safe missing directories", async () => {
    const fixes = await applySafeDoctorFixes({ targetPath: tempDir });

    expect(fixes.every((fix) => fix.applied)).toBe(true);
    expect(expectOk(await pathExists(path.join(tempDir, ".visp", "features")))).toBe(true);
  });

  it("dry-run writes nothing", async () => {
    const fixes = await applySafeDoctorFixes({ targetPath: tempDir, dryRun: true });

    expect(fixes.every((fix) => !fix.applied)).toBe(true);
    expect(expectOk(await pathExists(path.join(tempDir, ".visp")))).toBe(false);
  });
});
