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

describe("visp agent command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-agent-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("lists supported targets and JSON output", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "agent", "list"]);
    expect(output.join("")).toContain("codex");
    expect(output.join("")).toContain("generic");
    expect(output.join("")).toContain("claude");
    expect(output.join("")).toContain("copilot");

    output.length = 0;
    await program.parseAsync(["node", "visp", "agent", "list", "--json"]);
    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      targets: { name: string }[];
    };
    expect(summary.success).toBe(true);
    expect(summary.targets.map((target) => target.name)).toEqual([
      "codex",
      "generic",
      "claude",
      "copilot",
      "cursor",
      "gemini"
    ]);
  });

  it("installs Codex guidance and skills", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "agent", "install", "codex", tempDir]);

    expect(output.join("")).toContain("Visp agent installed");
    expect(await exists(path.join(tempDir, "AGENTS.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-feature", "SKILL.md"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-task", "SKILL.md"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-fix", "SKILL.md"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-review", "SKILL.md"))).toBe(
      true
    );
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-pr", "SKILL.md"))).toBe(true);

    const skill = await readFile(
      path.join(tempDir, ".agents", "skills", "visp-feature", "SKILL.md"),
      "utf8"
    );
    expect(skill).toContain("user prompt is raw intent");
    expect(skill).toContain("visp gate");

    output.length = 0;
    await program.parseAsync(["node", "visp", "agent", "doctor", tempDir, "--target", "codex"]);
    expect(output.join("")).toContain("Result: passed");
  });

  it("bootstraps a fresh project and installs Codex guidance", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "bootstrap",
      "codex",
      tempDir,
      "--preset",
      "typescript",
      "--budget",
      "lean",
      "--strictness",
      "strict"
    ]);

    expect(output.join("")).toContain("Visp agent bootstrapped");
    expect(await exists(path.join(tempDir, ".visp", "project.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "policy.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".agents", "skills", "visp-feature", "SKILL.md"))).toBe(
      true
    );
    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toContain(
      "visp agent bootstrap codex"
    );
  });

  it("bootstraps with auto-detected preset when preset is omitted", async () => {
    await writeFile(path.join(tempDir, "Cargo.toml"), "[package]\nname='fixture'\n", "utf8");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "bootstrap",
      "codex",
      tempDir,
      "--budget",
      "lean",
      "--strictness",
      "strict",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      init?: { preset: string };
    };

    expect(summary.init?.preset).toBe("rust");
  });

  it("supports bootstrap dry-run without writing files", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "bootstrap",
      "codex",
      tempDir,
      "--dry-run",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      dryRun: boolean;
      initialized: boolean;
      install: { createdFiles: string[] };
    };

    expect(summary.success).toBe(true);
    expect(summary.dryRun).toBe(true);
    expect(summary.initialized).toBe(true);
    expect(summary.install.createdFiles).toContain(".agents/skills/visp-feature/SKILL.md");
    expect(await exists(path.join(tempDir, ".visp"))).toBe(false);
  });

  it("installs generic guidance and prompt files with JSON output", async () => {
    await initProject(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "agent", "install", "generic", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      target: string;
      createdFiles: string[];
    };
    expect(summary.success).toBe(true);
    expect(summary.target).toBe("generic");
    expect(summary.createdFiles).toContain(".visp/prompts/agent-feature.prompt.md");
    expect(await exists(path.join(tempDir, ".visp", "prompts", "agent-pr.prompt.md"))).toBe(true);
  });

  it("dry-run writes nothing", async () => {
    await initProject(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "agent", "install", "codex", tempDir, "--dry-run"]);

    expect(await exists(path.join(tempDir, ".agents"))).toBe(false);
  });

  it("writes AGENTS.visp.md when AGENTS.md already exists without force", async () => {
    await initProject(tempDir);
    await writeFile(path.join(tempDir, "AGENTS.md"), "# Existing agent guide\n", "utf8");
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "agent", "install", "codex", tempDir]);

    expect(await readFile(path.join(tempDir, "AGENTS.md"), "utf8")).toBe(
      "# Existing agent guide\n"
    );
    expect(await exists(path.join(tempDir, "AGENTS.visp.md"))).toBe(true);
  });

  it("refreshes installed targets", async () => {
    await initProject(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "agent", "install", "codex", tempDir]);
    await writeFile(
      path.join(tempDir, ".agents", "skills", "visp-pr", "SKILL.md"),
      "stale",
      "utf8"
    );
    await program.parseAsync([
      "node",
      "visp",
      "agent",
      "refresh",
      tempDir,
      "--target",
      "codex",
      "--force"
    ]);

    expect(
      await readFile(path.join(tempDir, ".agents", "skills", "visp-pr", "SKILL.md"), "utf8")
    ).toContain("visp gate pr");
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({
      writeOut: () => undefined,
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "agent", "install", "codex", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init --strictness strict");
  });
});
