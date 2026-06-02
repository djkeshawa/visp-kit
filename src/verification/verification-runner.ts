import {
  defaultCommandRunner,
  type CommandRunner
} from "../core/command-runner.js";
import { type VerificationCommandResult } from "../artifacts/schemas/verification.schema.js";
import { captureOutput } from "./output-capture.js";

export type VerificationRunnerOptions = {
  readonly targetPath: string;
  readonly commands: readonly string[];
  readonly dryRun?: boolean;
  readonly commandRunner?: CommandRunner;
  readonly now?: () => string;
};

function splitCommand(command: string): readonly string[] {
  const parts: string[] = [];
  let current = "";
  let quote: '"' | "'" | null = null;

  for (const char of command) {
    if ((char === '"' || char === "'") && quote === null) {
      quote = char;
      continue;
    }

    if (char === quote) {
      quote = null;
      continue;
    }

    if (/\s/.test(char) && quote === null) {
      if (current.length > 0) {
        parts.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    parts.push(current);
  }

  return parts;
}

function skippedResult(input: {
  readonly command: string;
  readonly cwd: string;
  readonly reason: string;
  readonly now: string;
}): VerificationCommandResult {
  return {
    command: input.command,
    cwd: input.cwd,
    exitCode: null,
    success: true,
    durationMs: 0,
    startedAt: input.now,
    endedAt: input.now,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    skipped: true,
    skipReason: input.reason,
    timedOut: false
  };
}

export async function runVerificationCommands(
  options: VerificationRunnerOptions
): Promise<readonly VerificationCommandResult[]> {
  const runner = options.commandRunner ?? defaultCommandRunner;
  const now = options.now ?? (() => new Date().toISOString());
  const results: VerificationCommandResult[] = [];

  for (const command of options.commands) {
    const startedAt = now();

    if (options.dryRun) {
      results.push(
        skippedResult({
          command,
          cwd: options.targetPath,
          reason: "dry-run",
          now: startedAt
        })
      );
      continue;
    }

    const parts = splitCommand(command);
    const executable = parts[0];
    const args = parts.slice(1);

    if (executable === undefined) {
      results.push(
        skippedResult({
          command,
          cwd: options.targetPath,
          reason: "empty command",
          now: startedAt
        })
      );
      continue;
    }

    const startMs = Date.now();
    const result = await runner.run(executable, args, {
      cwd: options.targetPath,
      timeoutMs: 120_000
    });
    const endedAt = now();
    const durationMs = Math.max(0, Date.now() - startMs);
    const commandResult = result.ok
      ? result.value
      : result.error.details as
          | {
              readonly exitCode?: number | null;
              readonly stdout?: string;
              readonly stderr?: string;
              readonly timedOut?: boolean;
            }
          | undefined;
    const stdout = captureOutput(commandResult?.stdout ?? "");
    const stderr = captureOutput(commandResult?.stderr ?? "");
    const exitCode =
      result.ok
        ? result.value.exitCode
        : commandResult?.exitCode ?? null;

    results.push({
      command,
      cwd: options.targetPath,
      exitCode,
      success: result.ok,
      durationMs,
      startedAt,
      endedAt,
      stdout: stdout.value,
      stderr: stderr.value,
      stdoutTruncated: stdout.truncated,
      stderrTruncated: stderr.truncated,
      skipped: false,
      skipReason: null,
      timedOut: result.ok ? result.value.timedOut : commandResult?.timedOut ?? false
    });
  }

  return results;
}
