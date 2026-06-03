import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { pathExists } from "../../../src/core/file-system.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runPrWorkflow } from "../../../src/workflows/pr.workflow.js";

function runner(): CommandRunner {
  return {
    async run(command, args, options) {
      const joined = (args ?? []).join(" ");
      const stdout = joined === "rev-parse --is-inside-work-tree"
        ? "false\n"
        : "";

      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout,
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

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  expect(result.ok).toBe(true);
  return result.ok && result.value;
}

async function createFeature(rootPath: string): Promise<void> {
  expectOk(await runInitWorkflow({ targetPath: rootPath, agent: "none" }));
  expectOk(
    await runFeatureWorkflow({
      targetPath: rootPath,
      featureIdea: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z"
    })
  );
}

describe("runPrWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-pr-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("fails clearly when the project is not initialized", async () => {
    const result = await runPrWorkflow({
      targetPath: tempDir,
      commandRunner: runner()
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected PR workflow to fail.");
    expect(result.error.message).toContain("visp init");
  });

  it("writes PR markdown, JSON, prompt, and status when a feature is active", async () => {
    await createFeature(tempDir);

    const summary = expectOk(await runPrWorkflow({
      targetPath: tempDir,
      title: "Add note pinning",
      now: "2026-01-01T00:00:00.000Z",
      commandRunner: runner()
    }));

    expect(summary.success).toBe(true);
    expect(summary.prPath).toBe(".visp/features/001-add-note-pinning/pr.md");
    expect(summary.prJsonPath).toBe(".visp/features/001-add-note-pinning/pr.json");
    expect(summary.promptPath).toBe(".visp/prompts/pr.prompt.md");
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.json"))).toBe(true);
    expect(await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")).toContain('"lastCommand": "pr"');
  });

  it("prompt-only writes only the PR prompt", async () => {
    await createFeature(tempDir);

    const summary = expectOk(await runPrWorkflow({
      targetPath: tempDir,
      promptOnly: true,
      commandRunner: runner()
    }));

    expect(summary.prPath).toBeNull();
    expect(summary.prJsonPath).toBeNull();
    expect(summary.promptPath).toBe(".visp/prompts/pr.prompt.md");
    expect(await exists(path.join(tempDir, ".visp", "prompts", "pr.prompt.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.json"))).toBe(false);
  });

  it("dry-run writes nothing", async () => {
    await createFeature(tempDir);

    const summary = expectOk(await runPrWorkflow({
      targetPath: tempDir,
      dryRun: true,
      commandRunner: runner()
    }));

    expect(summary.prPath).toBeNull();
    expect(summary.promptPath).toBeNull();
    expect(await exists(path.join(tempDir, ".visp", "prompts", "pr.prompt.md"))).toBe(false);
  });
});
