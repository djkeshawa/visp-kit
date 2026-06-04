import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runAgentDoctor } from "../../../src/agent/agent-doctor.js";
import { runAgentInstall } from "../../../src/agent/agent-installer.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

describe("agent doctor", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-doctor-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("passes after Codex install", async () => {
    expectOk(await runAgentInstall({ targetPath: tempDir, target: "codex" }));

    const summary = expectOk(await runAgentDoctor({ targetPath: tempDir, target: "codex" }));

    expect(summary.result).toBe("passed");
    expect(summary.findings).toEqual([]);
  });

  it("detects missing generic prompt files", async () => {
    const summary = expectOk(await runAgentDoctor({ targetPath: tempDir, target: "generic" }));

    expect(summary.result).toBe("warnings");
    expect(summary.findings.some((finding) => finding.file?.includes("agent-feature.prompt.md"))).toBe(true);
  });
});
