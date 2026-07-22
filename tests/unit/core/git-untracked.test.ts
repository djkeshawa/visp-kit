import { describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { VispError } from "../../../src/core/errors.js";
import { listGitUntrackedFiles } from "../../../src/core/git-untracked.js";
import { err, ok } from "../../../src/core/result.js";

function commandResult(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly stdout: string;
}) {
  return {
    command: input.command,
    args: input.args,
    cwd: input.cwd,
    exitCode: 0,
    signal: null,
    stdout: input.stdout,
    stderr: "",
    timedOut: false
  } as const;
}

describe("Git untracked file enumeration", () => {
  it("uses exact argv and preserves NUL-delimited paths before deterministic deduplication", async () => {
    const calls: Array<{
      readonly command: string;
      readonly args: readonly string[];
      readonly cwd?: string;
    }> = [];
    const paths = [
      "space path.ts",
      "unicodé/日本語.ts",
      'quote-"path".ts',
      "-leading-dash.ts",
      "tab\tpath.ts",
      "line\nbreak.ts",
      "space path.ts"
    ];
    const runner: CommandRunner = {
      async run(command, args = [], options) {
        calls.push({ command, args, cwd: options?.cwd });
        return ok(
          commandResult({ command, args, cwd: options?.cwd, stdout: `${paths.join("\0")}\0` })
        );
      }
    };

    const result = await listGitUntrackedFiles({
      targetPath: "/workspace/project",
      commandRunner: runner
    });

    expect(calls).toEqual([
      {
        command: "git",
        args: ["ls-files", "--others", "--exclude-standard", "-z", "--"],
        cwd: "/workspace/project"
      }
    ]);
    expect(result).toEqual(ok([...new Set(paths)].sort()));
  });

  it("returns an empty list for empty output", async () => {
    const runner: CommandRunner = {
      async run(command, args = [], options) {
        return ok(commandResult({ command, args, cwd: options?.cwd, stdout: "" }));
      }
    };

    await expect(
      listGitUntrackedFiles({ targetPath: "/workspace/project", commandRunner: runner })
    ).resolves.toEqual(ok([]));
  });

  it("preserves typed command failures", async () => {
    const failure = new VispError("COMMAND_FAILED", "Unable to enumerate untracked paths.");
    const runner: CommandRunner = {
      async run() {
        return err(failure);
      }
    };

    const result = await listGitUntrackedFiles({
      targetPath: "/workspace/project",
      commandRunner: runner
    });

    expect(result).toEqual(err(failure));
  });
});
