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

describe("visp budget command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-budget-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("estimates all tasks for the active feature", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "budget", tempDir]);

    expect(output.join("")).toContain("Visp budget estimate");
    expect(output.join("")).toContain("Tasks: 1");
    expect(output.join("")).toContain("visp context --next");
  });

  it("returns task-level JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      estimatedTokens: { maxInput: number };
      tasks: Array<{ taskId: string }>;
    };

    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.estimatedTokens.maxInput).toBe(8000);
    expect(summary.tasks).toHaveLength(1);
  });

  it("writes the budget report when requested", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--write-report"
    ]);

    const reportPath = path.join(tempDir, ".visp", "reports", "budget-report.md");

    expect(await exists(reportPath)).toBe(true);
    expect(await readFile(reportPath, "utf8")).toContain("# Visp Budget Report");
  });

  it("marks over-budget tasks with max-token override", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--task",
      "T001",
      "--max-tokens",
      "100",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      overBudget: boolean;
      totals: { overBudgetTaskCount: number };
    };

    expect(summary.overBudget).toBe(true);
    expect(summary.totals.overBudgetTaskCount).toBe(1);
  });

  it("dry-run does not write reports", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--write-report",
      "--dry-run"
    ]);

    expect(await exists(path.join(tempDir, ".visp", "reports", "budget-report.md"))).toBe(
      true
    );
    expect(
      await readFile(path.join(tempDir, ".visp", "reports", "budget-report.md"), "utf8")
    ).toContain("No report has been generated yet");
  });
});
