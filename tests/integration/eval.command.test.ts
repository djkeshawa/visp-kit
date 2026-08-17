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

describe("visp-kit eval command", () => {
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

  it("says how many checks it ran, not just how many findings it had", async () => {
    // LC-108: the summary printed `Checks: 0` — the length of the findings list
    // — beside `Result: passed`, so a clean project and a project nothing could
    // be checked on printed the same line.
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir]);

    const printed = output.join("");

    expect(printed).toContain("Coverage:");
    expect(printed).toContain("Checks performed:");
    expect(printed).not.toContain("Checks: 0");
  });

  it("records which checks could not run and why", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--json"]);

    const report = JSON.parse(output.join("")) as {
      coverage: {
        checksPerformed: number;
        performedChecks: readonly string[];
        skippedChecks: readonly { inspection: string; reason: string }[];
        empty: boolean;
      };
    };

    expect(report.coverage.checksPerformed).toBeGreaterThan(0);
    expect(report.coverage.empty).toBe(false);
    expect(report.coverage.performedChecks).toContain("project initialization");
    expect(
      report.coverage.skippedChecks.some((entry) => entry.inspection === "review evidence")
    ).toBe(true);
    expect(report.coverage.skippedChecks.every((entry) => entry.reason.trim().length > 0)).toBe(
      true
    );
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

  it("includes deterministic benchmark metrics with --benchmark", async () => {
    await createPhase8Fixture(tempDir);
    const setup = createCli({ writeOut: () => undefined });

    await setup.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--benchmark", "--json"]);

    const report = JSON.parse(output.join("")) as {
      metrics?: {
        contextEfficiency: {
          measuredTaskCount: number;
          wholeRepoTokenBaseline: number;
          reductionRatio: number | null;
        };
        evidenceCompleteness: { ratio: number };
      };
    };

    expect(report.metrics).toBeDefined();
    expect(report.metrics?.contextEfficiency.measuredTaskCount).toBeGreaterThan(0);
    expect(report.metrics?.contextEfficiency.wholeRepoTokenBaseline).toBeGreaterThan(0);
    expect(report.metrics?.contextEfficiency.reductionRatio).not.toBeNull();
    expect(report.metrics?.evidenceCompleteness.ratio).toBeGreaterThan(0);
  });

  it("omits benchmark metrics without --benchmark", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--json"]);

    const report = JSON.parse(output.join("")) as { metrics?: unknown };

    expect(report.metrics).toBeUndefined();
  });

  it("reports a failed evaluation when .visp is missing", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "eval", tempDir, "--dry-run"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("failed");
  });
});
