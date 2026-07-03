import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { budgetArtifactPath } from "../../src/artifacts/artifact-paths.js";
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

    await program.parseAsync(["node", "visp", "budget", tempDir, "--task", "T001", "--json"]);

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

    await program.parseAsync(["node", "visp", "budget", tempDir, "--write-report"]);

    const reportPath = path.join(tempDir, ".visp", "reports", "budget-report.md");

    expect(await exists(reportPath)).toBe(true);
    expect(await readFile(reportPath, "utf8")).toContain("# Visp Budget Report");
  });

  it("records actual task token usage and includes it in the report", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const contextProgram = createCli({ writeOut: () => undefined });
    const program = createCli({ writeOut: (value) => output.push(value) });

    await contextProgram.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--task",
      "T001",
      "--record-usage",
      "--input-tokens",
      "1200",
      "--output-tokens",
      "300",
      "--model",
      "codex",
      "--usage-note",
      "Recorded after implementation.",
      "--write-report",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      totals: { actualInputTokens: number; actualTotalTokens: number };
      tasks: Array<{ actualTotalTokens: number }>;
      writtenFiles: string[];
    };
    const artifact = JSON.parse(await readFile(budgetArtifactPath(tempDir), "utf8")) as {
      usage: Array<{
        taskId: string;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
      }>;
    };
    const report = await readFile(
      path.join(tempDir, ".visp", "reports", "budget-report.md"),
      "utf8"
    );
    const checklist = await readFile(
      path.join(
        tempDir,
        ".visp",
        "features",
        "001-add-note-pinning",
        "context",
        "T001.implementation-checklist.md"
      ),
      "utf8"
    );

    expect(summary.totals.actualInputTokens).toBe(1200);
    expect(summary.totals.actualTotalTokens).toBe(1500);
    expect(summary.tasks[0]?.actualTotalTokens).toBe(1500);
    expect(summary.writtenFiles).toContain(".visp/budget.json");
    expect(artifact.usage[0]).toMatchObject({
      taskId: "T001",
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500
    });
    expect(report).toContain("Actual Usage");
    expect(report).toContain("1500");
    expect(checklist).toContain("- [x] Record actual token usage");
  });

  it("records unavailable actual usage without fake token counts", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const contextProgram = createCli({ writeOut: () => undefined });
    const program = createCli({ writeOut: (value) => output.push(value) });

    await contextProgram.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    await program.parseAsync([
      "node",
      "visp",
      "budget",
      tempDir,
      "--task",
      "T001",
      "--record-usage-unavailable",
      "--model",
      "codex",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--write-report",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      totals: { actualUsageStatus: string; actualTotalTokens: number | null };
      tasks: Array<{ actualUsageStatus: string; actualTotalTokens: number | null }>;
    };
    const artifact = JSON.parse(await readFile(budgetArtifactPath(tempDir), "utf8")) as {
      usage: Array<{ taskId: string; status: string; totalTokens: number | null; model: string }>;
    };
    const report = await readFile(
      path.join(tempDir, ".visp", "reports", "budget-report.md"),
      "utf8"
    );
    const checklistJson = JSON.parse(
      await readFile(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "context",
          "T001.implementation-checklist.json"
        ),
        "utf8"
      )
    ) as {
      items: Array<{ id: string; status: string; reason: string | null }>;
    };

    expect(summary.totals.actualUsageStatus).toBe("unavailable");
    expect(summary.totals.actualTotalTokens).toBeNull();
    expect(summary.tasks[0]?.actualUsageStatus).toBe("unavailable");
    expect(summary.tasks[0]?.actualTotalTokens).toBeNull();
    expect(artifact.usage[0]).toMatchObject({
      taskId: "T001",
      status: "unavailable",
      totalTokens: null,
      model: "codex"
    });
    expect(report).toContain("Actual Total");
    expect(report).toContain("unavailable");
    expect(checklistJson.items.find((item) => item.id === "record-usage")).toMatchObject({
      status: "unavailable",
      reason: "Agent surface did not expose numeric token usage."
    });
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
    const reportPath = path.join(tempDir, ".visp", "reports", "budget-report.md");
    const before = await readFile(reportPath, "utf8");
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "budget", tempDir, "--write-report", "--dry-run"]);

    expect(await exists(reportPath)).toBe(true);
    expect(await readFile(reportPath, "utf8")).toBe(before);
  });
});
