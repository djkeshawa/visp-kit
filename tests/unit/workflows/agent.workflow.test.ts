import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  runAgentInstallWorkflow,
  runAgentListWorkflow
} from "../../../src/workflows/agent.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

describe("agent workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists codex and generic targets only", () => {
    const summary = expectOk(runAgentListWorkflow());

    expect(summary.targets.map((target) => target.name)).toEqual(["codex", "generic"]);
  });

  it("installs generic prompts through workflow", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runAgentInstallWorkflow({
        targetPath: tempDir,
        target: "generic"
      })
    );

    expect(summary.createdFiles).toContain(".visp/prompts/agent-feature.prompt.md");
  });
});
