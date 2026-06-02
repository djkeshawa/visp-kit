import { describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { err, ok } from "../../../src/core/result.js";
import { VispError } from "../../../src/core/errors.js";
import { runVerificationCommands } from "../../../src/verification/verification-runner.js";

describe("verification runner", () => {
  it("captures passing command results", async () => {
    const runner: CommandRunner = {
      async run(command, args, options) {
        return ok({
          command,
          args: args ?? [],
          cwd: options?.cwd,
          exitCode: 0,
          signal: null,
          stdout: "ok",
          stderr: "",
          timedOut: false
        });
      }
    };

    const results = await runVerificationCommands({
      targetPath: "/workspace/project",
      commands: ["pnpm test"],
      commandRunner: runner,
      now: () => "2026-01-01T00:00:00.000Z"
    });

    expect(results[0]).toMatchObject({
      command: "pnpm test",
      cwd: "/workspace/project",
      exitCode: 0,
      success: true,
      stdout: "ok",
      skipped: false
    });
  });

  it("captures failing command output and exit code", async () => {
    const runner: CommandRunner = {
      async run(command, args, options) {
        return err(
          new VispError("COMMAND_FAILED", "Command failed.", {
            details: {
              command,
              args,
              cwd: options?.cwd,
              exitCode: 7,
              stdout: "",
              stderr: "not ok",
              timedOut: false
            }
          })
        );
      }
    };

    const results = await runVerificationCommands({
      targetPath: "/workspace/project",
      commands: ["pnpm test"],
      commandRunner: runner,
      now: () => "2026-01-01T00:00:00.000Z"
    });

    expect(results[0]).toMatchObject({
      exitCode: 7,
      success: false,
      stderr: "not ok"
    });
  });

  it("marks commands skipped during dry-run", async () => {
    const results = await runVerificationCommands({
      targetPath: "/workspace/project",
      commands: ["pnpm test"],
      dryRun: true,
      now: () => "2026-01-01T00:00:00.000Z"
    });

    expect(results[0]).toMatchObject({
      skipped: true,
      skipReason: "dry-run",
      success: true,
      exitCode: null
    });
  });
});
