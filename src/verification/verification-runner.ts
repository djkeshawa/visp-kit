import {
  defaultCommandRunner,
  type CommandResult,
  type CommandRunner
} from "../core/command-runner.js";
import {
  type VerificationCommandResult,
  type VerificationCommandRunner
} from "../artifacts/schemas/verification.schema.js";
import {
  profileVerificationCommand,
  type VerificationCommandProfile
} from "./command-profile.js";
import { captureOutput } from "./output-capture.js";

export type VerificationRunnerOptions = {
  readonly targetPath: string;
  readonly commands: readonly string[];
  readonly dryRun?: boolean;
  readonly commandRunner?: CommandRunner;
  readonly now?: () => string;
  readonly jsonOutput?: boolean;
};

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

function defaultShell(): string | null {
  return process.platform === "win32" ? "cmd.exe" : "/bin/sh";
}

function runnerMetadata(input: {
  readonly command: string;
  readonly executable: string;
  readonly args: readonly string[];
  readonly commandResult?: Partial<CommandResult>;
  readonly profile: VerificationCommandProfile;
}): VerificationCommandRunner {
  const result = input.commandResult;
  const stdioMode = result?.stdioMode ?? input.profile.stdioMode;

  return {
    executionMode: result?.executionMode ?? input.profile.executionMode,
    stdioMode,
    outputCaptureMode:
      result?.outputCaptureMode ?? (stdioMode === "inherit" ? "inherited" : "captured"),
    platform: result?.platform ?? process.platform,
    shell:
      result?.shell ??
      (input.profile.executionMode === "shell" ? defaultShell() : null),
    executable: result?.command ?? input.executable,
    args: [...(result?.args ?? input.args)],
    pid: result?.pid ?? null,
    profile: input.profile.profile,
    profileReason: input.profile.reason
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

    if (command.trim().length === 0) {
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

    const profile = await profileVerificationCommand({
      command,
      cwd: options.targetPath,
      jsonOutput: options.jsonOutput
    });
    const executable = profile.executable ?? command;
    const args = [...profile.args];
    const startMs = Date.now();
    const result = await runner.run(executable, args, {
      cwd: options.targetPath,
      timeoutMs: 120_000,
      executionMode: profile.executionMode,
      stdioMode: profile.stdioMode
    });
    const endedAt = now();
    const durationMs = Math.max(0, Date.now() - startMs);
    const commandResult = result.ok
      ? result.value
      : result.error.details as
          | Partial<CommandResult>
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
      timedOut: result.ok ? result.value.timedOut : commandResult?.timedOut ?? false,
      runner: runnerMetadata({
        command,
        executable,
        args,
        commandResult,
        profile
      })
    });
  }

  return results;
}
