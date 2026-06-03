import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { loadProjectState } from "../../../src/orchestrator/project-state.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function gitRunner(): CommandRunner {
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

  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

describe("project state loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-project-state-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles missing .visp", async () => {
    const state = expectOk(await loadProjectState({
      targetPath: tempDir,
      commandRunner: gitRunner()
    }));

    expect(state.initialized).toBe(false);
    expect(state.warnings.join(" ")).toContain("not initialized");
  });

  it("detects initialized projects", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const state = expectOk(await loadProjectState({
      targetPath: tempDir,
      commandRunner: gitRunner()
    }));

    expect(state.initialized).toBe(true);
    expect(state.config?.budgetMode).toBe("lean");
  });
});
