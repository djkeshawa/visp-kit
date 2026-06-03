import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp status command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-status-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("shows project and feature status", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "status", tempDir]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("Visp status");
    expect(output.join("")).toContain("001-add-note-pinning");
    expect(output.join("")).toContain("Next:");
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "status", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      activeFeature: { slug: string };
      nextCommand: string;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.activeFeature.slug).toBe("add-note-pinning");
    expect(summary.nextCommand).toBe("visp context --next");
  });

  it("writes a status report only when requested", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const reportPath = path.join(tempDir, ".visp", "reports", "status-report.md");

    expect(await exists(reportPath)).toBe(false);

    await program.parseAsync(["node", "visp", "status", tempDir, "--write-report"]);

    expect(await exists(reportPath)).toBe(true);
    expect(await readFile(reportPath, "utf8")).toContain("# Visp Status");
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "status", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
  });
});
