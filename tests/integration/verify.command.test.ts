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

async function useFastPassingCommand(rootPath: string): Promise<void> {
  await updateTask(rootPath, {
    validationCommands: ["node -e \"console.log('tests passed')\""]
  });
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

describe("visp verify command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-verify-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes verification markdown and JSON for a selected task", async () => {
    await createPhase8Fixture(tempDir);
    await useFastPassingCommand(tempDir);
    const output: string[] = [];
    const contextProgram = createCli({ writeOut: () => undefined });
    const program = createCli({ writeOut: (value) => output.push(value) });

    await contextProgram.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    await program.parseAsync(["node", "visp", "verify", tempDir, "--task", "T001"]);

    const featureDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning");

    expect(output.join("")).toContain("Visp verification complete");
    expect(await exists(path.join(featureDir, "verification.md"))).toBe(true);
    expect(await exists(path.join(featureDir, "verification.json"))).toBe(true);
    expect(await readFile(path.join(featureDir, "verification.md"), "utf8")).toContain(
      "# Verification Report"
    );
    expect(await readFile(path.join(featureDir, "verification.md"), "utf8")).toContain(
      "## Policy Gate"
    );
    expect(
      await readFile(path.join(featureDir, "context", "T001.implementation-checklist.md"), "utf8")
    ).toContain("- [x] Run validation commands or report why they could not run.");
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    await useFastPassingCommand(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "verify", tempDir, "--task", "T001", "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      summary: { commands: string };
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.summary.commands).toBe("passed");
  });

  it("skips commands when requested", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, {
      validationCommands: ['node -e "process.exit(1)"']
    });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--task",
      "T001",
      "--skip-commands"
    ]);

    const report = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.json"),
        "utf8"
      )
    ) as { commandValidation: { status: string; commands: unknown[] } };

    expect(output.join("")).toContain("Commands: skipped");
    expect(report.commandValidation.status).toBe("skipped");
    expect(report.commandValidation.commands).toEqual([]);
  });

  it("dry-run writes nothing and runs no commands", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, {
      validationCommands: ['node -e "process.exit(1)"']
    });
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "verify", tempDir, "--task", "T001", "--dry-run"]);

    expect(
      await exists(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.json")
      )
    ).toBe(false);
  });

  it("records failing commands and exits non-zero", async () => {
    await createPhase8Fixture(tempDir);
    await updateTask(tempDir, {
      validationCommands: ["node -e \"process.stderr.write('failed'); process.exit(7)\""]
    });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "verify", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Visp verification failed");
    expect(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "verification.md"),
        "utf8"
      )
    ).toContain("failed");
  });

  it("detects out-of-scope changed files", async () => {
    await createPhase8Fixture(tempDir);
    await writeFile(path.join(tempDir, "src", "other.ts"), "export const x = 1;\n");
    await initGitBaseline(tempDir);
    await writeFile(path.join(tempDir, "src", "other.ts"), "export const x = 2;\n");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "verify", tempDir, "--scope", "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Scope: failed");
  });

  it("detects unapproved dependency file changes", async () => {
    await createPhase8Fixture(tempDir);
    await initGitBaseline(tempDir);
    await writeFile(
      path.join(tempDir, "package.json"),
      `${JSON.stringify({ name: "changed", dependencies: { leftpad: "1.0.0" } }, null, 2)}\n`,
      "utf8"
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--dependencies",
      "--task",
      "T001"
    ]);

    expect(process.exitCode).toBe(1);
    expect(output.join("")).toContain("Dependencies: failed");
  });

  it("updates task status when explicitly requested", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "verify",
      tempDir,
      "--artifacts",
      "--task",
      "T001",
      "--update-task-status"
    ]);

    const taskGraph = JSON.parse(
      await readFile(
        path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json"),
        "utf8"
      )
    ) as { tasks: Array<{ id: string; status: string }> };

    expect(taskGraph.tasks[0]).toMatchObject({ id: "T001", status: "verified" });
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "verify", tempDir, "--task", "T001"]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp init");
  });
});
