import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runStatusWorkflow } from "../../../src/workflows/status.workflow.js";

function runner(): CommandRunner {
  return {
    async run(command, args, options) {
      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout: (args ?? []).join(" ") === "rev-parse --is-inside-work-tree" ? "false\n" : "",
        stderr: "",
        timedOut: false
      });
    }
  };
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok.");
  return result.value;
}

describe("runStatusWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-status-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes status reports when requested", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runStatusWorkflow({
        targetPath: tempDir,
        writeReport: true,
        commandRunner: runner()
      })
    );

    expect(summary.initialized).toBe(true);
    expect(summary.reportPath).toBe(".visp/reports/status-report.md");
    expect(await readFile(path.join(tempDir, ".visp", "reports", "status-report.md"), "utf8")).toContain("Visp Status");
  });

  it("fails clearly when the project is not initialized", async () => {
    const result = await runStatusWorkflow({
      targetPath: tempDir,
      commandRunner: runner()
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected status to fail.");
    expect(result.error.message).toContain("visp init");
  });
});
