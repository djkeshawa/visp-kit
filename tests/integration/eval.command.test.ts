import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp eval command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-eval-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("evaluates the fixture project and writes a report", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });
    const reportPath = path.join(tempDir, ".visp", "reports", "evaluation-report.md");

    await program.parseAsync(["node", "visp", "eval", tempDir]);

    expect(output.join("")).toContain("eval");
    expect(await exists(reportPath)).toBe(true);
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as { success: boolean };

    expect(errors.join("")).toBe("");
    expect(typeof summary.success).toBe("boolean");
  });

  it("dry-run writes nothing", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const reportPath = path.join(tempDir, ".visp", "reports", "evaluation-report.md");

    await program.parseAsync(["node", "visp", "eval", tempDir, "--dry-run"]);

    expect(await exists(reportPath)).toBe(false);
  });

  it("reports a failed evaluation when .visp is missing", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--dry-run"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("failed");
  });
});
