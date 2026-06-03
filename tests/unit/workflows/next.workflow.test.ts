import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { formatNextSummary, runNextWorkflow } from "../../../src/workflows/next.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

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

describe("runNextWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-next-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("recommends init when .visp is missing", async () => {
    const next = expectOk(await runNextWorkflow({
      targetPath: tempDir,
      commandRunner: runner()
    }));

    expect(next.nextCommand).toBe("visp init");
    expect(next.state).toBe("not-initialized");
  });

  it("recommends scan after initialization", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const next = expectOk(await runNextWorkflow({
      targetPath: tempDir,
      commandRunner: runner()
    }));

    expect(next.nextCommand).toBe("visp scan");
    expect(formatNextSummary(next, { commandOnly: true })).toBe("visp scan\n");
  });
});
