import { describe, expect, it } from "vitest";

import { type CommandResult, type CommandRunner } from "../../../src/core/command-runner.js";
import { VispError } from "../../../src/core/errors.js";
import { err, ok } from "../../../src/core/result.js";
import { createFeatureBranch, defaultFeatureBranchName } from "../../../src/features/git-branch.js";

function commandResult(command: string, args: readonly string[], stdout = ""): CommandResult {
  return {
    command,
    args,
    exitCode: 0,
    signal: null,
    stdout,
    stderr: "",
    timedOut: false
  };
}

describe("feature git branch helpers", () => {
  it("generates stable default branch names", () => {
    expect(defaultFeatureBranchName("001", "add-note-pinning")).toBe("visp/001-add-note-pinning");
  });

  it("creates a branch when Git checks pass", async () => {
    const calls: string[] = [];
    const runner: CommandRunner = {
      async run(command, args = []) {
        calls.push([command, ...args].join(" "));

        if (args[0] === "rev-parse" && args[1] === "--is-inside-work-tree") {
          return ok(commandResult(command, args, "true\n"));
        }

        if (args[0] === "rev-parse" && args[1] === "--verify") {
          return err(new VispError("COMMAND_FAILED", "missing branch"));
        }

        return ok(commandResult(command, args));
      }
    };

    const result = await createFeatureBranch({
      targetPath: "/project",
      branchName: "visp/001-add-note-pinning",
      force: false,
      commandRunner: runner
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.branch.created).toBe(true);
    }

    expect(calls).toContain("git switch -c visp/001-add-note-pinning");
  });

  it("warns and skips branch creation outside a Git repository", async () => {
    const runner: CommandRunner = {
      async run(command, args = []) {
        return err(
          new VispError("COMMAND_FAILED", "not a git repo", {
            details: commandResult(command, args)
          })
        );
      }
    };

    const result = await createFeatureBranch({
      targetPath: "/project",
      branchName: "visp/001-add-note-pinning",
      force: false,
      commandRunner: runner
    });

    expect(result.ok).toBe(true);

    if (result.ok) {
      expect(result.value.branch.created).toBe(false);
      expect(result.value.warnings[0]).toContain("not inside a Git repository");
    }
  });
});
