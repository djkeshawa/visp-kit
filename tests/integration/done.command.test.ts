import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { createPhase8Fixture, removeTempDirWithRetry } from "./phase8-fixture.js";

const execFileAsync = promisify(execFile);

type DoneJson = {
  success: boolean;
  taskId: string;
  steps: Array<{ name: string; success: boolean; skipped: boolean; recovery: string | null }>;
  nextCommand: string | null;
};

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

  taskGraph.tasks[0] = { ...taskGraph.tasks[0], ...patch };

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

/**
 * Write the task's actual work into the files it declared.
 *
 * These fixtures used to commit everything and then change nothing, so the
 * whole pipeline ran over a diff of Visp's own artifacts and still reported
 * `passed` (LC-106). A task that implements nothing is not a task that is done.
 */
async function implementTask(
  rootPath: string,
  options: { readonly tests?: boolean } = {}
): Promise<void> {
  const sourcePath = path.join(rootPath, "src", "notes.ts");

  await writeFile(
    sourcePath,
    `${await readFile(sourcePath, "utf8")}
export function unpinNote(note: Note): Note {
  return { ...note, pinned: false };
}
`,
    "utf8"
  );

  // A locked oracle pins existing test files by hash, so under assurance the
  // task cannot touch them without invalidating its own lock.
  if (options.tests === false) return;

  const testPath = path.join(rootPath, "tests", "notes.test.ts");

  await writeFile(
    testPath,
    `${await readFile(testPath, "utf8")}
test("unpinNote", () => {
  expect(unpinNote({ id: "1", title: "A", pinned: true }).pinned).toBe(false);
});
`,
    "utf8"
  );
}

async function prepareImplementedTask(
  rootPath: string,
  options: { readonly assurance?: boolean; readonly validationCommand?: string } = {}
): Promise<void> {
  await updateTask(rootPath, {
    validationCommands: [options.validationCommand ?? "node -e \"console.log('tests passed')\""],
    // Under assurance the locked oracle pins `tests/notes.test.ts` by hash, so
    // this task cannot touch it. `src/notes.ts` joins `expectedFiles` because it
    // is the deliverable this task does produce — LC-130 requires a review to
    // have seen at least one declared deliverable before `verified` is written,
    // and a task whose only listed deliverable is a file it may not change
    // could never satisfy that.
    ...((options.assurance ?? false)
      ? { expectedFiles: ["src/notes.ts", "tests/notes.test.ts"] }
      : {})
  });
  if (options.assurance ?? false) {
    const packagePath = path.join(rootPath, "package.json");
    const manifest = JSON.parse(await readFile(packagePath, "utf8")) as {
      scripts: Record<string, string>;
    };
    manifest.scripts.test = "node -e \"console.log('plan tests passed')\"";
    manifest.scripts.typecheck = "node -e \"console.log('types passed')\"";
    manifest.scripts.build = "node -e \"console.log('build passed')\"";
    await writeFile(packagePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  const silent = createCli({ writeOut: () => undefined });

  await silent.parseAsync(["node", "visp", "context", "T001", rootPath, "--force"]);
  await initGitBaseline(rootPath);
  if (options.assurance ?? false) {
    await silent.parseAsync(["node", "visp", "oracle", "plan", rootPath, "--task", "T001"]);
    await silent.parseAsync(["node", "visp", "oracle", "lock", rootPath, "--task", "T001"]);
    await silent.parseAsync(["node", "visp", "verify", rootPath, "--baseline", "--task", "T001"]);
  }
  await silent.parseAsync(["node", "visp", "gate", "implement", rootPath, "--task", "T001"]);
  await implementTask(rootPath, { tests: !(options.assurance ?? false) });

  for (const item of ["read-context", "implement-selected-task", "scope-check", "tests-updated"]) {
    await silent.parseAsync([
      "node",
      "visp",
      "checklist",
      "update",
      rootPath,
      "--task",
      "T001",
      "--item",
      item,
      "--status",
      "done",
      "--evidence",
      "Completed during integration test."
    ]);
  }
}

describe("visp-kit done command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-done-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
  });

  it("runs the full post-implementation pipeline for one task", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--model",
      "test-agent",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;

    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.steps.map((step) => step.name)).toEqual([
      "verify",
      "budget",
      "review",
      "reconcile",
      "checklist",
      "next"
    ]);
    expect(summary.steps.every((step) => step.success)).toBe(true);
    expect(summary.nextCommand).not.toBeNull();
    expect(process.exitCode).toBeUndefined();

    const markerPath = path.join(tempDir, ".visp", "state", "implement-allowed.json");
    await expect(readFile(markerPath, "utf8")).rejects.toThrow();
  });

  it("leaves the task in a terminal state the workflow can move past", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--usage-note",
      "Agent surface did not expose numeric token usage."
    ]);

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(taskGraph.tasks.find((task) => task.id === "T001")?.status).toBe("verified");
    expect(taskGraph.tasks.some((task) => task.status === "pending")).toBe(false);

    const statusOutput: string[] = [];
    const status = createCli({ writeOut: (value) => statusOutput.push(value) });
    await status.parseAsync(["node", "visp", "status", tempDir, "--json"]);

    const statusSummary = JSON.parse(statusOutput.join("")) as {
      taskSummary: { pending: number; verified: number };
    };

    expect(statusSummary.taskSummary.verified).toBe(1);
    expect(statusSummary.taskSummary.pending).toBe(0);

    const nextOutput: string[] = [];
    const next = createCli({ writeOut: (value) => nextOutput.push(value) });
    await next.parseAsync(["node", "visp", "next", tempDir, "--json"]);

    const nextSummary = JSON.parse(nextOutput.join("")) as { nextCommand: string };

    // The loop has an ending: `next` moves off the finished task instead of
    // pointing at `visp-kit context T001` forever.
    expect(nextSummary.nextCommand).not.toContain("T001");
    expect(nextSummary.nextCommand).toBe("visp-kit pr");
  });

  it("does not close the task when the pipeline stops on a blocking finding", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    // A forbidden dependency change is blocking drift. The pipeline stops at
    // the first step that sees it, and the task must not be closed behind it.
    await updateTask(tempDir, { forbiddenFiles: ["package.json"] });
    await writeFile(
      path.join(tempDir, "package.json"),
      `${await readFile(path.join(tempDir, "package.json"), "utf8")}\n`,
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(summary.success).toBe(false);
    expect(summary.steps.some((item) => !item.success)).toBe(true);
    expect(taskGraph.tasks.find((task) => task.id === "T001")?.status).not.toBe("verified");
    expect(taskGraph.tasks.find((task) => task.id === "T001")?.status).not.toBe("done");
    expect(process.exitCode).toBe(1);
  });

  it("stops at the first failing step and reports a recovery command", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, {
      validationCommands: ['node -e "process.exit(1)"']
    });
    const silent = createCli({ writeOut: () => undefined });
    await silent.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);
    await initGitBaseline(tempDir);

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "done", tempDir, "--task", "T001", "--json"]);

    const summary = JSON.parse(output.join("")) as DoneJson;

    expect(summary.success).toBe(false);
    expect(summary.steps).toHaveLength(1);
    expect(summary.steps[0]?.name).toBe("verify");
    expect(summary.steps[0]?.success).toBe(false);
    expect(summary.steps[0]?.recovery).toBe("visp-kit verify --task T001");
    expect(process.exitCode).toBe(1);
  });

  it("records what the verified status was decided on", async () => {
    // LC-130: `verified` was durable and basis-free, so a review of one comment
    // line and a review of the whole deliverable left identical task records.
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--usage-note",
      "Agent surface did not expose numeric token usage."
    ]);

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as {
      tasks: Array<{
        id: string;
        status: string;
        statusBasis?: {
          status: string;
          verificationPassed: boolean;
          review: { result: string; basis: string; reviewedExpectedFiles: string[] } | null;
        };
      }>;
    };
    const basis = taskGraph.tasks.find((task) => task.id === "T001")?.statusBasis;

    expect(basis?.status).toBe("verified");
    expect(basis?.verificationPassed).toBe(true);
    expect(basis?.review?.result).not.toBeUndefined();
    expect(basis?.review?.basis).toContain("working tree");
    expect(basis?.review?.reviewedExpectedFiles).toContain("tests/notes.test.ts");
  });

  it("refuses to verify a task when the review saw none of its expected files", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    // Undo the expected-file work, leaving only the allowed-file change — the
    // exact shape Assay reproduced: one edit inside `allowedFiles`, nothing in
    // `expectedFiles`, and a durable `verified` written on it.
    await execFileAsync("git", ["checkout", "--", "tests/notes.test.ts"], { cwd: tempDir });

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    const review = summary.steps.find((step) => step.name === "review");

    expect(review?.success).toBe(false);
    expect(summary.steps.some((step) => step.name === "reconcile")).toBe(false);

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(taskGraph.tasks.find((task) => task.id === "T001")?.status).not.toBe("verified");
  });

  it("recovers a failed review with the finding's own advice, not a command that repeats it", async () => {
    // LC-131: `done` hard-coded `visp-kit review --task <id>` for every review
    // failure, which on an empty working-tree scope produces byte-identical
    // output forever.
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
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
        "commit the work before reviewing"
      ],
      { cwd: tempDir }
    );

    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    const review = summary.steps.find((step) => step.name === "review");

    expect(review?.success).toBe(false);
    expect(review?.recovery).not.toBe("visp-kit review --task T001");
    expect(review?.recovery).toContain("--base");
    expect(summary.nextCommand).toBe("visp-kit review --task T001 --base <git-ref>");
  });

  it("names the flag the caller actually used when the budget step refuses", async () => {
    // LC-131: a run that failed for a missing `--usage-note` was told to supply
    // token counts it had just declared unavailable, and carried no `Next:`.
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    const budget = summary.steps.find((step) => step.name === "budget");

    expect(budget?.success).toBe(false);
    expect(budget?.recovery).toContain("--record-usage-unavailable");
    expect(budget?.recovery).toContain("--usage-note");
    expect(budget?.recovery).not.toContain("--input-tokens");
    expect(summary.nextCommand).toBe(budget?.recovery);
  });

  it("runs locked candidate evidence before the ordinary post-implementation checks", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir, { assurance: true });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--usage-unavailable",
      "--model",
      "test-agent",
      "--usage-note",
      "Agent surface did not expose numeric token usage.",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    expect(summary.success).toBe(true);
    expect(summary.steps.map((step) => step.name)).toEqual([
      "candidate",
      "verify",
      "budget",
      "review",
      "reconcile",
      "checklist",
      "next"
    ]);
    expect(
      await readFile(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "assurance",
          "T001",
          "candidate-evidence.json"
        ),
        "utf8"
      )
    ).toContain('"outcome": "passed"');
  });

  it("stops before ordinary verification when locked candidate evidence fails", async () => {
    await createPhase8Fixture(tempDir);
    await prepareImplementedTask(tempDir, {
      assurance: true,
      validationCommand: `node -e "process.exit(require('fs').readFileSync('src/notes.ts','utf8').includes('candidate-fail') ? 1 : 0)"`
    });
    const sourcePath = path.join(tempDir, "src", "notes.ts");
    await writeFile(
      sourcePath,
      `${await readFile(sourcePath, "utf8")}\n// candidate-fail\n`,
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "done", tempDir, "--task", "T001", "--json"]);

    const summary = JSON.parse(output.join("")) as DoneJson;
    expect(summary.success).toBe(false);
    expect(summary.steps).toEqual([
      expect.objectContaining({
        name: "candidate",
        success: false,
        recovery: "visp-kit verify --candidate --task T001"
      })
    ]);
    expect(process.exitCode).toBe(1);
  });

  it("requires --task", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "done", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as { success: boolean; error: string };

    expect(summary.success).toBe(false);
    expect(summary.error).toContain("requires --task");
    expect(process.exitCode).toBe(1);
  });

  it("rejects mixing recorded and unavailable usage", async () => {
    await createPhase8Fixture(tempDir);
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "done",
      tempDir,
      "--task",
      "T001",
      "--input-tokens",
      "100",
      "--output-tokens",
      "50",
      "--usage-unavailable"
    ]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("not both");
  });
});
