import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

const execFileAsync = promisify(execFile);

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function updateTask(rootPath: string, patch: Record<string, unknown>): Promise<void> {
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

async function corruptOverrideStore(rootPath: string): Promise<void> {
  await writeFile(path.join(rootPath, ".visp", "overrides.json"), "{ malformed overrides", "utf8");
}

describe("visp-kit review command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-review-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
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

    const reviewDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review");

    expect(output.join("")).toContain("Visp review complete");
    expect(await exists(path.join(reviewDir, "T001.review.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review.json"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review-prompt.md"))).toBe(true);
    expect(await exists(path.join(reviewDir, "T001.review-checklist.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "review.prompt.md"))).toBe(true);
    expect(await readFile(path.join(reviewDir, "T001.review.md"), "utf8")).toContain(
      "## Policy Gate"
    );
  });

  it("states the basis it reviewed and which files it examined", async () => {
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

    const printed = output.join("");

    expect(printed).toContain("Scope:");
    expect(printed).toContain("Uncommitted working tree");
    expect(printed).toContain("Files examined: 1");
    expect(printed).toContain("src/notes.ts");
    expect(printed).toContain("Reviewable files: 1");
    expect(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review", "T001.review.md"),
        "utf8"
      )
    ).toContain("## Review Basis");
  });

  it("refuses to pass when the working tree holds nothing it can review", async () => {
    await createPhase8Fixture(tempDir);
    await modifySource(tempDir);
    // The defect this pins: the agent commits its work, so the working tree is
    // clean and review sees only Visp's own artifacts. It used to report a
    // clean pass over zero of the author's files.
    await initGitBaseline(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

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
      result: string;
      scopeBasis: { kind: string; empty: boolean; reviewableFiles: string[] };
      findings: Array<{ severity: string; title: string }>;
    };

    expect(summary.result).not.toBe("passed");
    expect(summary.result).toBe("failed");
    expect(summary.success).toBe(false);
    expect(summary.scopeBasis.kind).toBe("working-tree");
    expect(summary.scopeBasis.empty).toBe(true);
    expect(summary.scopeBasis.reviewableFiles).toEqual([]);
    expect(summary.findings).toContainEqual(
      expect.objectContaining({
        severity: "error",
        title: "Review examined no reviewable changes"
      })
    );
    expect(process.exitCode).toBe(1);
  });

  it("reviews the committed work when --base names the range", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    await execFileAsync("git", ["add", "."], { cwd: tempDir });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.email=visp@example.test",
        "-c",
        "user.name=Visp Test",
        "commit",
        "-m",
        "implement the task"
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
      result: string;
      scopeBasis: { kind: string; baseRef: string; empty: boolean; reviewableFiles: string[] };
    };

    expect(summary.scopeBasis.kind).toBe("base-range");
    expect(summary.scopeBasis.baseRef).toBe("HEAD~1");
    expect(summary.scopeBasis.empty).toBe(false);
    expect(summary.scopeBasis.reviewableFiles).toContain("src/notes.ts");
    expect(summary.result).not.toBe("failed");
  });

  it("works at feature level when no task is selected", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "review", tempDir, "--skip-verification"]);

    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review.md"))
    ).toBe(true);
    expect(
      await exists(path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review.json"))
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

    const reviewDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review");

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

    const reviewDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "review");

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

    expect(summary.changedFiles.map((file) => file.path)).toEqual(["tests/notes.test.ts"]);
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
    expect(errors.join("")).toContain("visp-kit init");
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

  it("fails closed instead of advancing review when policy gate evaluation is unavailable", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await modifySource(tempDir);
    await corruptOverrideStore(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "review",
      tempDir,
      "--task",
      "T001",
      "--skip-verification",
      "--force",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      result: string;
      findings: Array<{ severity: string; title: string }>;
      nextCommand: string;
    };

    expect(summary.success).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(summary.result).toBe("failed");
    expect(
      summary.findings.some(
        (finding) =>
          finding.severity === "error" &&
          /(gate|policy)/i.test(finding.title) &&
          /(unavailable|evaluat)/i.test(finding.title)
      )
    ).toBe(true);
    expect(summary.nextCommand).not.toBe("visp-kit reconcile --task T001");

    const status = JSON.parse(
      await readFile(path.join(tempDir, ".visp", "status.json"), "utf8")
    ) as { currentState: string };

    expect(status.currentState).not.toBe("review_ready");
  });
});
