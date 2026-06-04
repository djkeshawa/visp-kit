import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installedTargetsPath } from "../../../src/agent/agent-paths.js";
import { runAgentInstall } from "../../../src/agent/agent-installer.js";
import { policyArtifactPath } from "../../../src/artifacts/artifact-paths.js";
import { pathExists } from "../../../src/core/file-system.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("agent installer", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-installer-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("installs Codex files and metadata", async () => {
    const summary = expectOk(
      await runAgentInstall({
        targetPath: tempDir,
        target: "codex",
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(summary.createdFiles).toContain("AGENTS.md");
    expect(summary.createdFiles).toContain(".agents/skills/visp-feature/SKILL.md");
    expect(summary.updatedFiles).toContain(".visp/policy.json");
    expect(await exists(installedTargetsPath(tempDir))).toBe(true);

    const policy = JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8")) as {
      strictnessMode: string;
    };
    expect(policy.strictnessMode).toBe("strict");
  });

  it("writes AGENTS.visp.md when AGENTS.md already exists without force", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "# Existing\n", "utf8");

    const summary = expectOk(
      await runAgentInstall({
        targetPath: tempDir,
        target: "generic"
      })
    );

    expect(summary.createdFiles).toContain("AGENTS.visp.md");
    expect(summary.warnings.join("\n")).toContain("AGENTS.md already exists");
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toBe("# Existing\n");
    expect(await exists(path.join(tempDir, "AGENTS.visp.md"))).toBe(true);
  });

  it("dry-run writes nothing", async () => {
    const summary = expectOk(
      await runAgentInstall({
        targetPath: tempDir,
        target: "codex",
        dryRun: true
      })
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.createdFiles).toContain("AGENTS.md");
    expect(await exists(path.join(tempDir, ".agents"))).toBe(false);
  });
});
