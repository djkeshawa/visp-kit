import { spawn } from "node:child_process";

import { VispError } from "./errors.js";
import { err, ok, type Result } from "./result.js";

export type RunCommandOptions = {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
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

    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const settle = (result: Result<CommandResult, VispError>): void => {
      if (!settled) {
        settled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        resolve(result);
      }
    };

    const timer =
      options.timeoutMs === undefined
        ? undefined
        : setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
          }, options.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      settle(
        err(
          new VispError("COMMAND_FAILED", `Failed to run command: ${command}.`, {
            cause: error,
            details: {
              command,
              args,
              cwd: options.cwd
            }
          })
        )
      );
    });

    child.on("close", (exitCode, signal) => {
      const result: CommandResult = {
        command,
        args,
        cwd: options.cwd,
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

export const defaultCommandRunner: CommandRunner = {
  run: runCommand
};
