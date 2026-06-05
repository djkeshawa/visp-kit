import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { err, ok } from "../../../src/core/result.js";
import { VispError } from "../../../src/core/errors.js";
import { runVerificationCommands } from "../../../src/verification/verification-runner.js";

describe("verification runner", () => {
  it("captures passing command results", async () => {
    const calls: unknown[] = [];
    const runner: CommandRunner = {
      async run(command, args, options) {
        calls.push({ command, args, options });
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
      skipped: false,
      runner: {
        executionMode: "shell",
        stdioMode: "capture",
        outputCaptureMode: "captured",
        profile: "default"
      }
    });
    expect(calls[0]).toMatchObject({
      command: "pnpm test",
      args: [],
      options: {
        executionMode: "shell",
        stdioMode: "capture"
      }
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

  it("uses inherited stdio for npm scripts that call Electron", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-verify-runner-"));

    try {
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "test:all": "npm run regression:renderer",
              "regression:renderer": "electron --no-sandbox scripts/regression-electron.js"
            }
          },
          null,
          2
        ),
        "utf8"
      );

      const calls: unknown[] = [];
      const runner: CommandRunner = {
        async run(command, args, options) {
          calls.push({ command, args, options });
          return ok({
            command,
            args: args ?? [],
            cwd: options?.cwd,
            exitCode: 0,
            signal: null,
            stdout: "",
            stderr: "",
            timedOut: false,
            executionMode: options?.executionMode,
            stdioMode: options?.stdioMode,
            outputCaptureMode:
              options?.stdioMode === "inherit"
                ? "inherited"
                : options?.stdioMode === "file" ? "file" : "captured"
          });
        }
      };

      const results = await runVerificationCommands({
        targetPath: tempDir,
        commands: ["npm run test:all"],
        commandRunner: runner,
        now: () => "2026-01-01T00:00:00.000Z"
      });

      expect(calls[0]).toMatchObject({
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", "test:all"],
        options: {
          executionMode: "argv",
          stdioMode: "inherit"
        }
      });
      expect(results[0]?.runner).toMatchObject({
        executionMode: "argv",
        stdioMode: "inherit",
        outputCaptureMode: "inherited",
        profile: "terminal-compatible",
        executable: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", "test:all"]
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps Electron-sensitive direct commands captured in JSON mode", async () => {
    const calls: unknown[] = [];
    const runner: CommandRunner = {
      async run(command, args, options) {
        calls.push({ command, args, options });
        return ok({
          command,
          args: args ?? [],
          cwd: options?.cwd,
          exitCode: 0,
          signal: null,
          stdout: "ok",
          stderr: "",
          timedOut: false,
          executionMode: options?.executionMode,
          stdioMode: options?.stdioMode,
          outputCaptureMode:
            options?.stdioMode === "inherit"
              ? "inherited"
              : options?.stdioMode === "file" ? "file" : "captured"
        });
      }
    };

    const results = await runVerificationCommands({
      targetPath: "/workspace/project",
      commands: ["electron --no-sandbox scripts/regression.js"],
      commandRunner: runner,
      jsonOutput: true,
      now: () => "2026-01-01T00:00:00.000Z"
    });

    expect(calls[0]).toMatchObject({
      options: {
        executionMode: "shell",
        stdioMode: "file"
      }
    });
    expect(results[0]?.runner).toMatchObject({
      stdioMode: "file",
      outputCaptureMode: "file",
      profile: "terminal-compatible"
    });
  });

  it("uses direct argv with captured output for Electron-sensitive npm scripts in JSON mode", async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-verify-json-"));

    try {
      await writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              "test:all": "npm run regression:renderer",
              "regression:renderer": "electron --no-sandbox scripts/regression-electron.js"
            }
          },
          null,
          2
        ),
        "utf8"
      );

      const calls: unknown[] = [];
      const runner: CommandRunner = {
        async run(command, args, options) {
          calls.push({ command, args, options });
          return ok({
            command,
            args: args ?? [],
            cwd: options?.cwd,
            exitCode: 0,
            signal: null,
            stdout: "ok",
            stderr: "",
            timedOut: false,
            executionMode: options?.executionMode,
            stdioMode: options?.stdioMode,
            outputCaptureMode:
              options?.stdioMode === "inherit"
                ? "inherited"
                : options?.stdioMode === "file" ? "file" : "captured"
          });
        }
      };

      const results = await runVerificationCommands({
        targetPath: tempDir,
        commands: ["npm run test:all"],
        commandRunner: runner,
        jsonOutput: true,
        now: () => "2026-01-01T00:00:00.000Z"
      });

      expect(calls[0]).toMatchObject({
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["run", "test:all"],
        options: {
          executionMode: "argv",
          stdioMode: "file"
        }
      });
      expect(results[0]?.runner).toMatchObject({
        executionMode: "argv",
        stdioMode: "file",
        outputCaptureMode: "file",
        profile: "terminal-compatible"
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
