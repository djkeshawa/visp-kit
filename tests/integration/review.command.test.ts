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

async function updateTask(
  rootPath: string,
  patch: Record<string, unknown>
): Promise<void> {
  const taskGraphPath = path.join(
    rootPath,
    ".visp",
    "features",
    "001-add-note-pinning",
    "task-graph.json"
  );
  const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
    tasks: Array<Record<string, unknown>>;
  };

  taskGraph.tasks[0] = {
    ...taskGraph.tasks[0],
    ...patch
  };

  await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");
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

describe("visp review command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-review-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes task review markdown, JSON, prompt, and checklist", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--skip-verification"
    ]);

    const reviewDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "review"
    );

    expect(output.join("")).toContain("Visp review complete");
    expect(await exists(path.join(reviewDir, "T001.review.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review.json"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review-prompt.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review-checklist.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "review.prompt.md"))).toBe(true);
  });

  it("works at feature level when no task is selected", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--skip-verification"
    ]);

    expect(
      await exists(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review.md")
      )
    ).toBe(true);
    expect(
      await exists(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review.json")
      )
    ).toBe(true);
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--json",
      "--skip-verification"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      changedFiles: Array<{ path: string }>;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.changedFiles.map((file) => file.path)).toEqual(["src/notes.ts"]);
  });

  it("prompt-only writes only prompt files", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--prompt-only",
      "--skip-verification"
    ]);

    const reviewDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "review"
    );

    expect(await exists(path.join(reviewDir, "T001.review-prompt.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "review.prompt.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review.json"))).toBe(false);
    expect(await exists(path.join(reviewDir, "T001.review-checklist.md"))).toBe(false);
  });

  it("checklist-only writes only checklist", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--checklist-only",
      "--skip-verification"
    ]);

    const reviewDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "review"
    );

    expect(await exists(path.join(reviewDir, "T001.review-checklist.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review.json"))).toBe(false);
    expect(await exists(path.join(reviewDir, "T001.review-prompt.md"))).toBe(false);
  });

  it("dry-run writes nothing", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--dry-run",
      "--skip-verification"
    ]);

    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "review",
          "T001.review.json"
        )
      )
    ).toBe(false);
  });

  it("staged reviews staged changes only", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    await writeFile(path.join(tempDir, "tests", "notes.test.ts"), "test.todo('changed');\n");
    await execFileAsync("git", ["add", "tests/notes.test.ts"], { cwd: tempDir });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--staged",
      "--json",
      "--skip-verification"
    ]);

    const summary = JSON.parse(output.join("")) as {
      changedFiles: Array<{ path: string }>;
    };

    expect(summary.changedFiles.map((file) => file.path)).toEqual([
      "tests/notes.test.ts"
    ]);
  });

  it("base ref reviews committed changes against base", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    await execFileAsync("git", ["add", "src/notes.ts"], { cwd: tempDir });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.email=visp@example.test",
        "-c",
        "user.name=Visp Test",
        "commit",
        "-m",
        "change notes"
      ],
      { cwd: tempDir }
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--base",
      "HEAD~1",
      "--json",
      "--skip-verification"
    ]);

    const summary = JSON.parse(output.join("")) as {
      changedFiles: Array<{ path: string }>;
    };

    expect(summary.changedFiles.map((file) => file.path)).toEqual(["src/notes.ts"]);
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "review", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
  });

  it("fails clearly when target is not a Git repo", async () => {
    await createPhase8Fixture(tempDir);
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "review", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("requires Git");
  });

  it("fails review for forbidden dependency file changes", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, { forbiddenFiles: ["package.json"] });
    await initGitBaseline(tempDir);
    await writeFile(
      path.join(tempDir, "package.json"),
      `${JSON.stringify({ name: "changed" }, null, 2)}\n`,
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--skip-verification"
    ]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Visp review failed");
    expect(output.join("")).toContain("Forbidden file changed");
  });

  it("updates status after review generation", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--skip-verification"
    ]);

    const status = JSON.parse(
      await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")
    ) as { currentState: string; lastCommand: string; activeTaskId: string };

    expect(status).toMatchObject({
      currentState: "review_ready",
      lastCommand: "review",
      activeTaskId: "T001"
    });
  });
});
