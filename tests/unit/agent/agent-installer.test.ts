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

  it("preserves custom policy settings when updating strictness", async () => {
    const policyPath = policyArtifactPath(tempDir);
    const policy = JSON.parse(await readFile(policyPath, "utf8")) as {
      limits: { maxChangedFilesPerTask: number };
      overrides: { allowedInLockedMode: boolean };
    };

    policy.limits.maxChangedFilesPerTask = 42;
    policy.overrides.allowedInLockedMode = true;
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    expectOk(
      await runAgentInstall({
        targetPath: tempDir,
        target: "codex",
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const updated = JSON.parse(await readFile(policyPath, "utf8")) as {
      strictnessMode: string;
      limits: { maxChangedFilesPerTask: number };
      overrides: { allowedInLockedMode: boolean };
      rules: { requireScanBeforeFeature: boolean };
    };

    expect(updated.strictnessMode).toBe("strict");
    expect(updated.rules.requireScanBeforeFeature).toBe(true);
    expect(updated.limits.maxChangedFilesPerTask).toBe(42);
    expect(updated.overrides.allowedInLockedMode).toBe(true);
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

  it("does not claim a second identical run wrote the AGENTS.visp.md it left alone", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "# Existing\n", "utf8");
    expectOk(await runAgentInstall({ targetPath: tempDir, target: "generic" }));
    const written = await readFile(path.join(tempDir, "AGENTS.visp.md"), "utf8");

    const second = expectOk(await runAgentInstall({ targetPath: tempDir, target: "generic" }));

    const warnings = second.warnings.join("\n");
    expect(second.skippedFiles).toContain("AGENTS.visp.md");
    expect(warnings).toContain("Left the existing AGENTS.visp.md unchanged");
    expect(warnings).not.toContain("Wrote AGENTS.visp.md");
    // The note is only true if the file really was left alone.
    expect(await readFile(path.join(tempDir, "AGENTS.visp.md"), "utf8")).toBe(written);
  });

  it("says it wrote AGENTS.visp.md when a rerun really does rewrite it", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "# Existing\n", "utf8");
    expectOk(
      await runAgentInstall({ targetPath: tempDir, target: "generic", strictness: "standard" })
    );
    const written = await readFile(path.join(tempDir, "AGENTS.visp.md"), "utf8");

    const second = expectOk(
      await runAgentInstall({ targetPath: tempDir, target: "generic", strictness: "locked" })
    );

    expect(second.warnings.join("\n")).toContain("Wrote AGENTS.visp.md for manual merge");
    expect(await readFile(path.join(tempDir, "AGENTS.visp.md"), "utf8")).not.toBe(written);
  });

  it("does not claim a dry run wrote AGENTS.visp.md", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "# Existing\n", "utf8");

    const summary = expectOk(
      await runAgentInstall({ targetPath: tempDir, target: "generic", dryRun: true })
    );

    expect(summary.warnings.join("\n")).toContain("Would write AGENTS.visp.md");
    expect(await exists(path.join(tempDir, "AGENTS.visp.md"))).toBe(false);
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
