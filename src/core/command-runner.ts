import { spawn } from "node:child_process";
import { type ChildProcess, type StdioOptions } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { VispError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export type CommandExecutionMode = "argv" | "shell";
export type CommandStdioMode = "capture" | "inherit" | "file";
export type CommandOutputCaptureMode = "captured" | "inherited" | "file";

export type RunCommandOptions = {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
  readonly executionMode?: CommandExecutionMode;
  readonly stdioMode?: CommandStdioMode;
  readonly shell?: boolean | string;
};

export type CommandResult = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly executionMode?: CommandExecutionMode;
  readonly stdioMode?: CommandStdioMode;
  readonly outputCaptureMode?: CommandOutputCaptureMode;
  readonly platform?: NodeJS.Platform;
  readonly shell?: string | null;
  readonly pid?: number | null;
};

export interface CommandRunner {
  run(
    command: string,
    args?: readonly string[],
    options?: RunCommandOptions
  ): Promise<Result<CommandResult, VispError>>;
}

export async function runCommand(
  command: string,
  args: readonly string[] = [],
  options: RunCommandOptions = {}
): Promise<Result<CommandResult, VispError>> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;
    const executionMode = options.executionMode ?? "argv";
    const stdioMode = options.stdioMode ?? "capture";
    const outputCaptureMode =
      stdioMode === "inherit" ? "inherited" : stdioMode === "file" ? "file" : "captured";
    const shellOption = executionMode === "shell" ? (options.shell ?? true) : false;
    const shell =
      typeof shellOption === "string"
        ? shellOption
        : shellOption
          ? process.platform === "win32"
            ? "cmd.exe"
            : "/bin/sh"
          : null;
    const fileCapture =
      stdioMode === "file"
        ? (() => {
            const dir = mkdtempSync(path.join(os.tmpdir(), "visp-command-"));
            const stdoutPath = path.join(dir, "stdout.log");
            const stderrPath = path.join(dir, "stderr.log");

            return {
              dir,
              stdoutPath,
              stderrPath,
              stdoutFd: openSync(stdoutPath, "w+"),
              stderrFd: openSync(stderrPath, "w+")
            };
          })()
        : undefined;
    const stdio: StdioOptions =
      stdioMode === "inherit"
        ? "inherit"
        : stdioMode === "file" && fileCapture !== undefined
          ? ["inherit", fileCapture.stdoutFd, fileCapture.stderrFd]
          : ["ignore", "pipe", "pipe"];

    const child: ChildProcess = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: shellOption,
      stdio
    });

    const baseResult = (): Omit<
      CommandResult,
      "exitCode" | "signal" | "stdout" | "stderr" | "timedOut"
    > => ({
      command,
      args,
      cwd: options.cwd,
      executionMode,
      stdioMode,
      outputCaptureMode,
      platform: process.platform,
      shell,
      pid: child.pid ?? null
    });

    const settle = (result: Result<CommandResult, VispError>): void => {
      if (!settled) {
        settled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        if (forceKillTimer !== undefined) {
          clearTimeout(forceKillTimer);
        }
        resolve(result);
      }
    };

    const closeFileCapture = (): void => {
      if (fileCapture === undefined) return;

      try {
        closeSync(fileCapture.stdoutFd);
      } catch {
        // Ignore cleanup errors after process completion.
      }

      try {
        closeSync(fileCapture.stderrFd);
      } catch {
        // Ignore cleanup errors after process completion.
      }
    };

    const readFileCapture = (): void => {
      if (fileCapture === undefined) return;

      try {
        stdout = readFileSync(fileCapture.stdoutPath, "utf8");
      } catch {
        stdout = "";
      }

      try {
        stderr = readFileSync(fileCapture.stderrPath, "utf8");
      } catch {
        stderr = "";
      }

      try {
        rmSync(fileCapture.dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors; command result should still be returned.
      }
    };

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            forceKillTimer = setTimeout(() => {
              if (!settled) child.kill("SIGKILL");
            }, 250);
          }, options.timeoutMs);

    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error: Error) => {
      closeFileCapture();
      readFileCapture();
      settle(
        err(
          new VispError("COMMAND_FAILED", `Failed to run command: ${command}.`, {
            cause: error,
            details: baseResult()
          })
        )
      );
    });

    child.on("close", (exitCode: number | null, signal: NodeJS.Signals | null) => {
      closeFileCapture();
      readFileCapture();
      const result: CommandResult = {
        ...baseResult(),
        exitCode,
        signal,
        stdout,
        stderr,
        timedOut
      };

      if (exitCode === 0 && !timedOut) {
        settle(ok(result));
        return;
      }

      settle(
        err(
          new VispError("COMMAND_FAILED", `Command failed: ${command}.`, {
            details: { ...result }
          })
        )
      );
    });
  });
}

export function runShellCommand(
  command: string,
  options: RunCommandOptions = {}
): Promise<Result<CommandResult, VispError>> {
  return runCommand(command, [], { ...options, executionMode: "shell" });
}

export const defaultCommandRunner: CommandRunner = {
  run: runCommand
};
