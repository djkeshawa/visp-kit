import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAgentInstall } from "../../../src/agent/agent-installer.js";
import { runAgentRefresh } from "../../../src/agent/agent-refresh.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

describe("agent refresh", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-refresh-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails clearly when no targets are installed", async () => {
    const result = await runAgentRefresh({ targetPath: tempDir });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain("No installed agent targets");
  });

  it("refreshes an installed Codex target with force", async () => {
    expectOk(await runAgentInstall({ targetPath: tempDir, target: "codex" }));
    const skillPath = path.join(tempDir, ".agents", "skills", "visp-task", "SKILL.md");
    await writeFile(skillPath, "stale", "utf8");

    const summaries = expectOk(
      await runAgentRefresh({
        targetPath: tempDir,
        target: "codex",
        force: true
      })
    );

    expect(summaries[0]?.overwrittenFiles).toContain(".agents/skills/visp-task/SKILL.md");
    expect(await readFile(skillPath, "utf8")).toContain("user prompt is raw intent");
  });

  it("refreshes all installed target kinds", async () => {
    for (const target of ["codex", "generic", "claude", "copilot"] as const) {
      expectOk(await runAgentInstall({ targetPath: tempDir, target }));
    }

    const summaries = expectOk(
      await runAgentRefresh({
        targetPath: tempDir,
        target: "all",
        force: true
      })
    );

    expect([...summaries.map((summary) => summary.target)].sort()).toEqual([
      "claude",
      "codex",
      "copilot",
      "generic"
    ]);
  });
});
