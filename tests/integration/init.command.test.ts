import { CommanderError } from "commander";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) {
    throw new Error("Expected result to be ok.");
  }

  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp-kit init command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-init-command-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates a Codex TypeScript lean init from CLI options", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "init",
      tempDir,
      "--agent",
      "codex",
      "--preset",
      "typescript",
      "--budget",
      "lean",
      "--strictness",
      "strict"
    ]);

    expect(output.join("")).toContain("Visp Kit initialized");
    expect(await exists(path.join(tempDir, ".visp", "project.json"))).toBe(true);
    expect(await exists(path.join(tempDir, "AGENTS.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-task", "SKILL.md"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".visp", "policy.json"))).toBe(true);
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toContain(
      "visp-kit gate implement"
    );
  });

  it("prints parseable JSON summaries", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "init", tempDir, "--agent", "none", "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      agent: string;
      createdFiles: string[];
    };

    expect(summary.success).toBe(true);
    expect(summary.agent).toBe("none");
    expect(summary.createdFiles).toContain(".visp/project.json");
  });

  it("uses the current working directory when no path is provided", async () => {
    const originalCwd = process.cwd();
    const output: string[] = [];

    process.chdir(tempDir);

    try {
      const program = createCli({ writeOut: (value) => output.push(value) });
      await program.parseAsync(["node", "visp", "init", "--agent", "none"]);
    } finally {
      process.chdir(originalCwd);
    }

    expect(output.join("")).toContain("Target:");
    expect(await exists(path.join(tempDir, ".visp", "status.json"))).toBe(true);
  });

  it("does not write files during dry-run", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "init", path.join(tempDir, "dry"), "--dry-run"]);

    expect(output.join("")).toContain("dry run");
    expect(await exists(path.join(tempDir, "dry"))).toBe(false);
  });

  it("fails clearly for invalid flag values", async () => {
    const program = createCli();
    let caught: unknown;

    program.configureOutput({
      writeOut: () => undefined,
      writeErr: () => undefined
    });
    program.exitOverride();
    program.commands.find((command) => command.name() === "init")?.exitOverride();

    try {
      await program.parseAsync(["node", "visp", "init", "--agent", "robot"]);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(CommanderError);

    if (caught instanceof CommanderError) {
      expect(caught.message).toContain("is invalid");
      expect(caught.message).toContain("robot");
      expect(caught.message).toContain("codex, generic, none");
    }
  });
});
