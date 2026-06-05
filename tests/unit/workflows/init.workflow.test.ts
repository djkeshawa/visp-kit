import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { readArtifact } from "../../../src/artifacts/artifact-reader.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../../../src/artifacts/schemas/project.schema.js";
import { policyArtifactSchema } from "../../../src/artifacts/schemas/policy.schema.js";
import { pathExists } from "../../../src/core/file-system.js";
import { isOk } from "../../../src/core/result.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  return expectOk(result);
}

describe("runInitWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-init-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates the base .visp structure and validates JSON artifacts", async () => {
    const summary = expectOk(
      await runInitWorkflow({
        targetPath: tempDir,
        agent: "none",
        preset: "generic",
        budget: "lean",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(summary.createdFiles).toContain(".visp/project.json");
    expect(summary.createdFiles).toContain(".visp/config.json");
    expect(summary.createdFiles).toContain(".visp/status.json");
    expect(summary.createdFiles).toContain(".visp/policy.json");
    expect(summary.createdFiles).toContain(".visp/memory/constitution.md");
    expect(summary.createdFiles).toContain(".visp/cache/scan-meta.json");
    expect(summary.createdFiles).toContain(".visp/reports/scan-report.md");
    expect(await exists(path.join(tempDir, ".visp", "features"))).toBe(true);

    expect(
      isOk(
        await readArtifact(
          path.join(tempDir, ".visp", "project.json"),
          projectProfileSchema
        )
      )
    ).toBe(true);
    expect(
      isOk(
        await readArtifact(
          path.join(tempDir, ".visp", "config.json"),
          projectConfigSchema
        )
      )
    ).toBe(true);
    expect(
      isOk(
        await readArtifact(
          path.join(tempDir, ".visp", "status.json"),
          projectStatusSchema
        )
      )
    ).toBe(true);
    const policy = await readArtifact(
      path.join(tempDir, ".visp", "policy.json"),
      policyArtifactSchema
    );

    expect(isOk(policy)).toBe(true);
    if (policy.ok) {
      expect(policy.value.strictnessMode).toBe("standard");
    }
  });

  it("creates policy with selected strictness", async () => {
    expectOk(
      await runInitWorkflow({
        targetPath: tempDir,
        agent: "none",
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const policy = expectOk(
      await readArtifact(
        path.join(tempDir, ".visp", "policy.json"),
        policyArtifactSchema
      )
    );

    expect(policy.strictnessMode).toBe("strict");
    expect(policy.rules.requireContextBeforeImplementation).toBe(true);
  });

  it("creates Codex guidance and starter skills", async () => {
    const summary = expectOk(
      await runInitWorkflow({
        targetPath: tempDir,
        agent: "codex",
        preset: "typescript",
        budget: "lean"
      })
    );

    expect(summary.createdFiles).toContain("AGENTS.md");
    expect(summary.createdFiles).toContain(
      ".agents/skills/visp-feature/SKILL.md"
    );
    expect(summary.createdFiles).toContain(
      ".agents/skills/visp-pr/SKILL.md"
    );
    expect(summary.createdFiles).toContain(".visp/agent/installed-targets.json");
    expect(await exists(path.join(tempDir, ".agents", "skills"))).toBe(true);
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toContain(
      "The user prompt is raw intent only"
    );
    expect(
      await readFile(
        path.join(tempDir, ".agents", "skills", "visp-task", "SKILL.md"),
        "utf8"
      )
    ).toContain("visp gate");
  });

  it("creates generic agent guidance and portable prompts without Codex skills", async () => {
    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "generic" })
    );

    expect(summary.createdFiles).toContain("AGENTS.md");
    expect(summary.createdFiles).toContain(".visp/prompts/agent-feature.prompt.md");
    expect(summary.createdFiles).toContain(".visp/prompts/agent-task.prompt.md");
    expect(await exists(path.join(tempDir, ".agents"))).toBe(false);
  });

  it("does not create agent files in none mode", async () => {
    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "none" })
    );

    expect(summary.createdFiles).not.toContain(".visp/memory/agent-guidance.md");
    expect(await exists(path.join(tempDir, "AGENTS.md"))).toBe(false);
    expect(await exists(path.join(tempDir, ".agents"))).toBe(false);
  });

  it("skips existing files without force", async () => {
    const constitutionPath = path.join(
      tempDir,
      ".visp",
      "memory",
      "constitution.md"
    );
    await mkdir(path.dirname(constitutionPath), { recursive: true });
    await writeFile(constitutionPath, "custom constitution", "utf8");

    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "none" })
    );

    expect(summary.skippedFiles).toContain(".visp/memory/constitution.md");
    expect(await readFile(constitutionPath, "utf8")).toBe("custom constitution");
  });

  it("overwrites existing files with force", async () => {
    const constitutionPath = path.join(
      tempDir,
      ".visp",
      "memory",
      "constitution.md"
    );
    await mkdir(path.dirname(constitutionPath), { recursive: true });
    await writeFile(constitutionPath, "custom constitution", "utf8");

    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "none", force: true })
    );

    expect(summary.overwrittenFiles).toContain(".visp/memory/constitution.md");
    expect(await readFile(constitutionPath, "utf8")).toContain(
      "# Visp Constitution"
    );
  });

  it("creates AGENTS.visp.md when AGENTS.md exists without force", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "existing", "utf8");

    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "codex" })
    );

    expect(summary.skippedFiles).toContain("AGENTS.md");
    expect(summary.createdFiles).toContain("AGENTS.visp.md");
    expect(summary.warnings.join("\n")).toContain("AGENTS.md already exists");
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toBe(
      "existing"
    );
  });

  it("overwrites AGENTS.md with force", async () => {
    await writeFile(path.join(tempDir, "AGENTS.md"), "existing", "utf8");

    const summary = expectOk(
      await runInitWorkflow({ targetPath: tempDir, agent: "codex", force: true })
    );

    expect(summary.overwrittenFiles).toContain("AGENTS.md");
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toContain(
      "Visp Kit Agent Guidance"
    );
  });

  it("dry-run reports actions without writing files", async () => {
    const targetPath = path.join(tempDir, "new-project");
    const summary = expectOk(
      await runInitWorkflow({ targetPath, agent: "codex", dryRun: true })
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.createdFiles).toContain(".visp/project.json");
    expect(await exists(targetPath)).toBe(false);
  });

  it("creates a missing target directory", async () => {
    const targetPath = path.join(tempDir, "missing-project");

    expectOk(await runInitWorkflow({ targetPath, agent: "none" }));

    expect(await exists(path.join(targetPath, ".visp", "project.json"))).toBe(
      true
    );
  });
});
