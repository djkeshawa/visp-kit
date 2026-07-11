import { describe, expect, it } from "vitest";

import { runCommand, runShellCommand } from "../../src/core/command-runner.js";
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
    // cmd.exe echo appends trailing whitespace and CRLF, so use node for an
    // exact stderr payload on Windows.
    return {
      command: process.execPath,
      args: ["-e", "process.stderr.write('not ok'); process.exit(7);"]
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
      const details = result.error.details as {
        exitCode: number;
        stderr: string;
        timedOut: boolean;
      };
      expect(details.exitCode).toBe(7);
      // The runner preserves captured output verbatim; Windows `cmd.exe echo`
      // appends a trailing "\r\n", so compare trim-tolerantly rather than
      // altering the product's raw-output contract.
      expect(details.stderr.trim()).toBe("not ok");
      expect(details.timedOut).toBe(false);
    }
  });

  it("runs full command strings through the shell when requested", async () => {
    const result = await runShellCommand("echo shell visp");

    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.stdout.trim()).toBe("shell visp");
      expect(result.value.executionMode).toBe("shell");
      expect(result.value.stdioMode).toBe("capture");
      expect(result.value.outputCaptureMode).toBe("captured");
    }
  });

  it("supports inherited stdio for terminal-compatible validation commands", async () => {
    const result = await runCommand(process.execPath, ["-e", ""], {
      stdioMode: "inherit"
    });

    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.stdout).toBe("");
      expect(result.value.stderr).toBe("");
      expect(result.value.stdioMode).toBe("inherit");
      expect(result.value.outputCaptureMode).toBe("inherited");
    }
  });

  it("captures output through files when requested", async () => {
    const result = await runCommand(process.execPath, ["-e", "console.log('file visp')"], {
      stdioMode: "file"
    });

    expect(isOk(result)).toBe(true);

    if (isOk(result)) {
      expect(result.value.stdout.trim()).toBe("file visp");
      expect(result.value.stderr).toBe("");
      expect(result.value.stdioMode).toBe("file");
      expect(result.value.outputCaptureMode).toBe("file");
    }
  });
});
