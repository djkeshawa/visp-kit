import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initProject(rootPath: string): Promise<void> {
  const program = createCli({ writeOut: () => undefined, writeErr: () => undefined });
  await program.parseAsync([
    "node",
    "visp",
    "init",
    rootPath,
    "--agent",
    "none",
    "--preset",
    "typescript",
    "--budget",
    "lean",
    "--strictness",
    "strict"
  ]);
  process.exitCode = undefined;
}

describe("visp-kit agent claude command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-claude-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  // P10-US-06: installed slash commands are Hyper-owned. Kit's claude target
  // installs its rules file and hooks only, and never writes .claude/commands.
  it("installs rules and hooks, writes no slash commands, and passes doctor", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "agent", "install", "claude", tempDir]);

    expect(output.join("")).toContain("Visp agent installed");
    expect(await exists(path.join(tempDir, ".visp", "prompts", "visp-rules.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "hooks", "claude-pretooluse.mjs"))).toBe(true);
    expect(await exists(path.join(tempDir, ".claude", "commands"))).toBe(false);

    const rules = await readFile(path.join(tempDir, ".visp", "prompts", "visp-rules.md"), "utf8");
    expect(rules).toContain("visp-kit verify");

    output.length = 0;
    await program.parseAsync(["node", "visp", "agent", "doctor", tempDir, "--target", "claude"]);
    expect(output.join("")).toContain("Result: passed");
  });

  it("dry-run writes nothing and JSON output is parseable", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "install",
      "claude",
      tempDir,
      "--json",
      "--dry-run"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      target: string;
      createdFiles: string[];
    };
    expect(summary.success).toBe(true);
    expect(summary.target).toBe("claude");
    expect(summary.createdFiles).toContain(".visp/prompts/visp-rules.md");
    expect(summary.createdFiles.some((file) => file.includes(".claude/commands"))).toBe(false);
    expect(await exists(path.join(tempDir, ".claude"))).toBe(false);
  });

  it("skips existing Claude files without force and refreshes with force", async () => {
    await initProject(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "agent", "install", "claude", tempDir]);
    const rulesPath = path.join(tempDir, ".visp", "prompts", "visp-rules.md");
    await writeFile(rulesPath, "existing", "utf8");
    await program.parseAsync(["node", "visp", "agent", "install", "claude", tempDir]);
    expect(await readFile(rulesPath, "utf8")).toBe("existing");

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "refresh",
      tempDir,
      "--target",
      "claude",
      "--force"
    ]);
    expect(await readFile(rulesPath, "utf8")).toContain("visp-kit verify");
    // Hyper owns installed slash commands; a Kit refresh must not create them.
    expect(await exists(path.join(tempDir, ".claude", "commands"))).toBe(false);
  });
});
