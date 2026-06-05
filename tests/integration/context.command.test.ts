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

describe("visp context command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-context-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates context markdown, JSON, task prompt, and current prompt", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--force"
    ]);

    const contextDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "context"
    );

    expect(output.join("")).toContain("Visp context ready");
    expect(await exists(path.join(contextDir, "T001.context.md"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.context.json"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.prompt.md"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.implementation-checklist.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "current-task.prompt.md"))).toBe(
      true
    );

    const contextJson = JSON.parse(
      await readFile(path.join(contextDir, "T001.context.json"), "utf8")
    ) as {
      taskId: string;
      strictnessMode?: string;
      gateStatus?: string;
      policyGate?: { stage: string; allowed: boolean };
      includedRequirements: Array<{ id: string }>;
      includedFiles: Array<{ path: string; includeMode: string }>;
      estimatedTokens: { maxInput: number };
    };
    const currentPrompt = await readFile(
      path.join(tempDir, ".visp", "prompts", "current-task.prompt.md"),
      "utf8"
    );
    const budgetReport = await readFile(
      path.join(tempDir, ".visp", "reports", "budget-report.md"),
      "utf8"
    );

    expect(contextJson.taskId).toBe("T001");
    expect(contextJson.strictnessMode).toBe("standard");
    expect(contextJson.gateStatus).toBe("warnings");
    expect(contextJson.policyGate?.stage).toBe("implement");
    expect(currentPrompt).toContain("# Strict Visp Task Prompt");
    expect(currentPrompt).toContain("The user request is raw intent only");
    expect(currentPrompt).toContain("Implementation Checklist");
    expect(currentPrompt).toContain("visp budget --task T001 --record-usage");
    expect(contextJson.includedRequirements.map((item) => item.id)).toEqual([
      "REQ001"
    ]);
    expect(contextJson.includedFiles.map((item) => item.path)).toContain(
      "src/notes.ts"
    );
    expect(contextJson.estimatedTokens.maxInput).toBe(8000);
    expect(budgetReport).toContain("# Visp Budget Report");
    expect(budgetReport).toContain("| T001 |");
  });

  it("selects the next ready task and returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "--next",
      tempDir,
      "--json",
      "--force"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      budgetMode: string;
    };

    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.budgetMode).toBe("lean");
  });

  it("marks over-budget contexts with max-token override", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--max-tokens",
      "100",
      "--json",
      "--force"
    ]);

    const summary = JSON.parse(output.join("")) as {
      overBudget: boolean;
      estimatedTokens: { maxInput: number };
    };

    expect(summary.estimatedTokens.maxInput).toBe(100);
    expect(summary.overBudget).toBe(true);
  });

  it("dry-run writes nothing", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--dry-run"
    ]);

    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "context",
          "T001.context.md"
        )
      )
    ).toBe(false);
  });

  it("fails clearly for missing tasks and missing .visp", async () => {
    await createPhase8Fixture(tempDir);
    const errors: string[] = [];
    let program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "context", "T999", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("Available task IDs");

    process.exitCode = undefined;
    errors.length = 0;
    const missingDir = await mkdtemp(path.join(os.tmpdir(), "visp-context-missing-"));
    program = createCli({ writeErr: (value) => errors.push(value) });

    try {
      await program.parseAsync(["node", "visp", "context", "T001", missingDir]);
      expect(process.exitCode).toBe(1);
      expect(errors.join("")).toContain("visp init");
    } finally {
      await rm(missingDir, { recursive: true, force: true });
    }
  });
});
