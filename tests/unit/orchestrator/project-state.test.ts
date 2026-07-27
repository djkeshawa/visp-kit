import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { VispError } from "../../../src/core/errors.js";
import { err, ok } from "../../../src/core/result.js";
import { loadProjectState } from "../../../src/orchestrator/project-state.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function gitRunner(): CommandRunner {
  return {
    async run(command, args, options) {
      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout: (args ?? []).join(" ") === "rev-parse --is-inside-work-tree" ? "false\n" : "",
        stderr: "",
        timedOut: false
      });
    }
  };
}

function repoRunner(
  input: {
    readonly failUntracked?: boolean;
    readonly stagedFiles?: readonly string[];
    readonly unstagedFiles?: readonly string[];
    readonly untrackedFiles?: readonly string[];
    readonly calls?: Array<readonly string[]>;
  } = {}
): CommandRunner {
  return {
    async run(command, args = [], options) {
      input.calls?.push(args);
      const joined = args.join(" ");

      if (joined === "ls-files --others --exclude-standard -z --" && input.failUntracked) {
        return err(new VispError("COMMAND_FAILED", "untracked enumeration failed"));
      }

      const stdout =
        joined === "rev-parse --is-inside-work-tree"
          ? "true\n"
          : joined === "branch --show-current"
            ? "develop\n"
            : joined === "diff --cached --name-only -z --"
              ? `${(input.stagedFiles ?? ["src/shared.ts", "src/staged.ts"]).join("\0")}\0`
              : joined === "diff --name-only -z --"
                ? `${(input.unstagedFiles ?? ["src/shared.ts", "src/unstaged.ts"]).join("\0")}\0`
                : joined === "ls-files --others --exclude-standard -z --"
                  ? `${(input.untrackedFiles ?? ["src/shared.ts", "src/untracked.ts"]).join("\0")}\0`
                  : "";

      return ok({
        command,
        args,
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout,
        stderr: "",
        timedOut: false
      });
    }
  };
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);

  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

describe("project state loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-project-state-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("handles missing .visp", async () => {
    const state = expectOk(
      await loadProjectState({
        targetPath: tempDir,
        commandRunner: gitRunner()
      })
    );

    expect(state.initialized).toBe(false);
    expect(state.warnings.join(" ")).toContain("not initialized");
  });

  it("detects initialized projects", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const state = expectOk(
      await loadProjectState({
        targetPath: tempDir,
        commandRunner: gitRunner()
      })
    );

    expect(state.initialized).toBe(true);
    expect(state.config?.budgetMode).toBe("lean");
  });

  it("counts the deduplicated union of tracked and untracked unstaged files", async () => {
    const state = expectOk(
      await loadProjectState({
        targetPath: tempDir,
        commandRunner: repoRunner()
      })
    );

    expect(state.git.branch).toBe("develop");
    expect(state.git.stagedCount).toBe(2);
    expect(state.git.unstagedCount).toBe(3);
    expect(state.git.changedFiles).toEqual([
      "src/shared.ts",
      "src/staged.ts",
      "src/unstaged.ts",
      "src/untracked.ts"
    ]);
  });

  it("preserves tracked state and adds a specific warning when untracked enumeration fails", async () => {
    const state = expectOk(
      await loadProjectState({
        targetPath: tempDir,
        commandRunner: repoRunner({ failUntracked: true })
      })
    );

    expect(state.git.stagedCount).toBe(2);
    expect(state.git.unstagedCount).toBe(2);
    expect(state.git.changedFiles).toEqual(["src/shared.ts", "src/staged.ts", "src/unstaged.ts"]);
    expect(state.git.warnings).toContain("Unable to read untracked Git changes.");
  });

  it("preserves raw staged and unstaged tracked identities in counts and inventory", async () => {
    const stagedFiles = [
      " src/notes.ts",
      "src/notes.ts ",
      "src\\notes.ts",
      " .visp/state/implement-allowed.json"
    ];
    const unstagedFiles = [
      "src/tab\tname.ts",
      "src/line\nname.ts",
      "src/control\u0001name.ts",
      ".visp\\state\\implement-allowed\\T001.json"
    ];
    const calls: Array<readonly string[]> = [];
    const state = expectOk(
      await loadProjectState({
        targetPath: tempDir,
        commandRunner: repoRunner({
          stagedFiles,
          unstagedFiles,
          untrackedFiles: [],
          calls
        })
      })
    );

    expect(state.git.stagedCount).toBe(stagedFiles.length);
    expect(state.git.unstagedCount).toBe(unstagedFiles.length);
    expect(state.git.changedFiles).toEqual([...stagedFiles, ...unstagedFiles].sort());
    expect(calls).toContainEqual(["diff", "--cached", "--name-only", "-z", "--"]);
    expect(calls).toContainEqual(["diff", "--name-only", "-z", "--"]);
  });

  it("records a corrupt core artifact as an error, not a warning (F-C1)", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeFile(path.join(tempDir, ".visp", "status.json"), "NOT JSON {{{\n");

    const state = expectOk(
      await loadProjectState({ targetPath: tempDir, commandRunner: gitRunner() })
    );

    // A file that exists but cannot be parsed is not the same as one that was
    // never written. Demoting it to a warning let a corrupted project read as
    // a fresh one.
    expect(state.errors.join(" ")).toContain("project status is unreadable");
    expect(state.warnings.join(" ")).not.toContain("project status is unreadable");
  });

  it("still treats a genuinely absent optional artifact as absent", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "overrides.json"), { force: true });

    const state = expectOk(
      await loadProjectState({ targetPath: tempDir, commandRunner: gitRunner() })
    );

    // The fix must not turn every unwritten optional artifact into an error.
    expect(state.errors).toEqual([]);
  });
});
