import { describe, expect, it } from "vitest";

import { runCommand } from "../../src/core/command-runner.js";
import { isErr, isOk } from "../../src/core/result.js";

function successCommand(): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "echo hello visp"]
    };
  }

  return { command: "/bin/echo", args: ["hello visp"] };
}

function failureCommand(): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "echo not ok 1>&2 & exit /b 7"]
    };
  }

  return {
    command: "/bin/sh",
    args: ["-c", "printf 'not ok' >&2; exit 7"]
  };
}

describe("command runner", () => {
  it("captures successful command output", async () => {
    const command = successCommand();
    const result = await runCommand(command.command, command.args);

    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.exitCode).toBe(0);
      expect(result.value.stdout.trim()).toBe("hello visp");
      expect(result.value.stderr).toBe("");
      expect(result.value.command).toBe(command.command);
    }
  });

  it("returns a command failure for non-zero exits", async () => {
    const command = failureCommand();
    const result = await runCommand(command.command, command.args);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("COMMAND_FAILED");
      expect(result.error.details).toMatchObject({
        exitCode: 7,
        stderr: "not ok",
        timedOut: false
      });
    }
  });
});
