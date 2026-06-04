import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function initGitBaseline(rootPath: string): Promise<void> {
  await execFileAsync("git", ["init"], { cwd: rootPath });
  await execFileAsync("git", ["add", "."], { cwd: rootPath });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.email=visp@example.test",
      "-c",
      "user.name=Visp Test",
      "commit",
      "-m",
      "initial fixture"
    ],
    { cwd: rootPath }
  );
}

async function modifySource(rootPath: string): Promise<void> {
  await writeFile(
    path.join(rootPath, "src", "notes.ts"),
    `export interface Note {
  id: string;
  title: string;
  pinned?: boolean;
}

export function pinNote(note: Note): Note {
  return { ...note, pinned: true };
}

export function unpinNote(note: Note): Note {
  return { ...note, pinned: false };
}
`,
    "utf8"
  );
}

describe("visp pr command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-pr-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates PR markdown, JSON, and prompt files", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "pr", tempDir, "--title", "Add note pinning"]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("Visp PR summary ready");
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "pr.prompt.md"))).toBe(true);
    const prMarkdown = await readFile(
      path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.md"),
      "utf8"
    );

    expect(prMarkdown).toContain("src/notes.ts");
    expect(prMarkdown).toContain("## Policy Readiness");
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "pr", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      feature: { slug: string };
      prPath: string;
      promptPath: string;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.feature.slug).toBe("add-note-pinning");
    expect(summary.prPath).toBe(".visp/features/001-add-note-pinning/pr.md");
    expect(summary.promptPath).toBe(".visp/prompts/pr.prompt.md");
  });

  it("blocks PR readiness in strict mode when reconcile evidence is missing", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "policy",
      "set-strictness",
      "strict",
      tempDir
    ]);
    await program.parseAsync(["node", "visp", "pr", tempDir]);

    const prMarkdown = await readFile(
      path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.md"),
      "utf8"
    );

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Visp PR readiness blocked");
    expect(prMarkdown).toContain("Gate: pr");
    expect(prMarkdown).toContain("VSP016");
  });

  it("prompt-only writes only the PR prompt", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "pr", tempDir, "--prompt-only"]);

    expect(await exists(path.join(tempDir, ".visp", "prompts", "pr.prompt.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.json"))).toBe(false);
  });

  it("dry-run writes nothing", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "pr", tempDir, "--dry-run"]);

    expect(await exists(path.join(tempDir, ".visp", "prompts", "pr.prompt.md"))).toBe(false);
    expect(await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "pr.json"))).toBe(false);
  });
});
