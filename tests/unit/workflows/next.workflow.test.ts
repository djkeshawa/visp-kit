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
    const next = expectOk(
      await runNextWorkflow({
        targetPath: tempDir,
        commandRunner: runner()
      })
    );

    expect(next.nextCommand).toBe("visp init");
    expect(next.state).toBe("not-initialized");
  });

  it("recommends scan after initialization", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const next = expectOk(
      await runNextWorkflow({
        targetPath: tempDir,
        commandRunner: runner()
      })
    );

    expect(next.nextCommand).toBe("visp scan");
    expect(formatNextSummary(next, { commandOnly: true })).toBe("visp scan\n");
  });

  it("forwards the selected workflow-action protocol while retaining v2 by default", async () => {
    const defaultNext = expectOk(
      await runNextWorkflow({ targetPath: tempDir, commandRunner: runner() })
    );
    const explicitV2 = expectOk(
      await runNextWorkflow({
        targetPath: tempDir,
        commandRunner: runner(),
        protocol: "2.0"
      })
    );
    const explicitV3 = expectOk(
      await runNextWorkflow({
        targetPath: tempDir,
        commandRunner: runner(),
        protocol: "3.0"
      })
    );

    expect(defaultNext.action).toEqual(explicitV2.action);
    expect(defaultNext.action?.protocolVersion).toBe("2.0");
    expect(explicitV3.action?.protocolVersion).toBe("3.0");
  });
});
