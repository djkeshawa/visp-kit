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

async function prepareReconcileFixture(rootPath: string): Promise<void> {
  await createPhase8Fixture(rootPath);
  const setupProgram = createCli({ writeOut: () => undefined });

  await setupProgram.parseAsync(["node", "visp", "context", "T001", rootPath, "--force"]);
  await initGitBaseline(rootPath);
  await modifySource(rootPath);

  const program = createCli({ writeOut: () => undefined });

  await program.parseAsync([
    "node",
    "visp",
    "verify",
    rootPath,
    "--task",
    "T001",
    "--skip-commands"
  ]);
  process.exitCode = undefined;
  await program.parseAsync(["node", "visp", "review", rootPath, "--task", "T001"]);
  process.exitCode = undefined;
}

// These suites spawn git and run the full pipeline, which is slow on Windows
// CI; raise the per-hook/test timeout above the 5s default.
describe("visp reconcile command", { timeout: 30000 }, () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-reconcile-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
  });

  it("writes task reconciliation markdown, JSON, prompt, and shared prompt", async () => {
    await prepareReconcileFixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001"]);

    const reconcileDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "reconcile"
    );

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("Visp reconciliation");
    expect(await exists(path.join(reconcileDir, "T001.reconcile.md"))).toBe(true);
    expect(await exists(path.join(reconcileDir, "T001.reconcile.json"))).toBe(true);
    expect(await exists(path.join(reconcileDir, "T001.reconcile-prompt.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "reconcile.prompt.md"))).toBe(true);
    expect(await readFile(path.join(reconcileDir, "T001.reconcile.md"), "utf8")).toContain(
      "## Policy Gate"
    );
  });

  it("returns JSON only", async () => {
    await prepareReconcileFixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001", "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      changedFiles: Array<{ path: string; mappingStatus: string }>;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.changedFiles).toEqual(
      expect.arrayContaining([
        {
          path: "src/notes.ts",
          mappingStatus: "mapped",
          relatedTaskIds: ["T001"],
          relatedRequirementIds: expect.any(Array),
          relatedAcceptanceCriterionIds: expect.any(Array)
        },
        {
          path: ".visp/status.json",
          mappingStatus: "generated",
          relatedTaskIds: [],
          relatedRequirementIds: expect.any(Array),
          relatedAcceptanceCriterionIds: expect.any(Array)
        }
      ])
    );
  });

  it("dry-run writes nothing", async () => {
    await prepareReconcileFixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001", "--dry-run"]);

    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "reconcile",
          "T001.reconcile.json"
        )
      )
    ).toBe(false);
  });

  it("prompt-only writes only prompt files", async () => {
    await prepareReconcileFixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "reconcile",
      tempDir,
      "--task",
      "T001",
      "--prompt-only"
    ]);

    const reconcileDir = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "reconcile"
    );

    expect(await exists(path.join(reconcileDir, "T001.reconcile-prompt.md"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "reconcile.prompt.md"))).toBe(true);
    expect(await exists(path.join(reconcileDir, "T001.reconcile.json"))).toBe(false);
  });

  it("updates traceability and task status when requested and safe", async () => {
    await prepareReconcileFixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "reconcile",
      tempDir,
      "--task",
      "T001",
      "--update-traceability",
      "--update-task-status",
      "--force"
    ]);

    const traceability = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "traceability.json"),
        "utf8"
      )
    ) as { entries: Array<{ filePaths: string[]; status: string }> };
    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ status: string }> };

    expect(traceability.entries[0]?.filePaths).toContain("src/notes.ts");
    expect(traceability.entries[0]?.status).toBe("partial");
    expect(taskGraph.tasks[0]?.status).toBe("verified");
  });

  it("fails clearly when .visp is missing", async () => {
    const output: string[] = [];
    const program = createCli({ writeErr: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "reconcile", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("visp init");
  });

  it("fails clearly when target is not a Git repository", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeErr: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("requires Git");
  });

  it("fails clearly when selected task does not exist", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    const output: string[] = [];
    const program = createCli({ writeErr: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T999"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Available task IDs");
  });

  it("failed verification causes failed reconciliation", async () => {
    await prepareReconcileFixture(tempDir);
    const verificationPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "verification.json"
    );
    const verification = JSON.parse(await readFile(verificationPath, "utf8")) as Record<
      string,
      unknown
    >;
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await writeFile(
      verificationPath,
      `${JSON.stringify({ ...verification, success: false, errors: ["tests failed"] }, null, 2)}\n`,
      "utf8"
    );
    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Verification failed");
  });

  it("failed review causes failed reconciliation", async () => {
    await prepareReconcileFixture(tempDir);
    const reviewPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "review",
      "T001.review.json"
    );
    const review = JSON.parse(await readFile(reviewPath, "utf8")) as Record<string, unknown>;
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await writeFile(
      reviewPath,
      `${JSON.stringify({ ...review, result: "failed", errors: ["scope failed"] }, null, 2)}\n`,
      "utf8"
    );
    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Review failed");
  });

  it("detects unapproved dependency changes", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, { forbiddenFiles: [] });
    await initGitBaseline(tempDir);
    await writeFile(
      path.join(tempDir, "package.json"),
      `${JSON.stringify({ name: "changed", dependencies: { leftpad: "1.0.0" } }, null, 2)}\n`,
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "reconcile", tempDir, "--task", "T001", "--force"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Unapproved dependency change");
  });
});
