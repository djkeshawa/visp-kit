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

async function prepareImplementedTask(
  rootPath: string,
  options: { readonly assurance?: boolean; readonly validationCommand?: string } = {}
): Promise<void> {
  await updateTask(rootPath, {
    validationCommands: [options.validationCommand ?? "node -e \"console.log('tests passed')\""]
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
