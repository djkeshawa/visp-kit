import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { checkSchemas } from "../../../src/doctor/doctor-checks.js";
import { loadProjectState } from "../../../src/orchestrator/project-state.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function runner(): CommandRunner {
  return {
    async run(command, args, options) {
      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout: (args ?? []).join(" ") === "rev-parse --is-inside-work-tree" ? "false\n" : "",
        stderr: "",
        timedOut: false
      });
    }
  };
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok.");
  return result.value;
}

describe("doctor schema checks", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-doctor-schemas-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const state = async () =>
    expectOk(await loadProjectState({ targetPath: tempDir, commandRunner: runner() }));

  it("reports a healthy project as clean", async () => {
    const result = await checkSchemas(await state());

    expect(result.findings).toEqual([]);
  });

  it("reports a deleted required artifact as loudly as a corrupted one (F-C2)", async () => {
    const runIndex = path.join(tempDir, ".visp", "runs", "index.json");

    await writeFile(runIndex, "BROKEN {{{\n");

    const corrupted = await checkSchemas(await state());

    await rm(runIndex, { force: true });

    const deleted = await checkSchemas(await state());

    // Deleting an artifact used to be quieter than corrupting one, so an
    // interrupted run — which leaves files missing rather than malformed —
    // passed doctor. Both must now be errors.
    expect(corrupted.findings.some((entry) => entry.severity === "error")).toBe(true);
    expect(deleted.findings.some((entry) => entry.severity === "error")).toBe(true);
    expect(deleted.findings.some((entry) => entry.title === "Required artifact missing")).toBe(
      true
    );
  });

  it("does not report absent optional artifacts as missing", async () => {
    await rm(path.join(tempDir, ".visp", "overrides.json"), { force: true });
    await rm(path.join(tempDir, ".visp", "reports", "evaluation-report.json"), { force: true });

    const result = await checkSchemas(await state());

    // Optional artifacts are absent until the workflow that writes them runs.
    // Marking those required would report a healthy new project as broken,
    // which is how a check gets disabled rather than fixed.
    expect(result.findings).toEqual([]);
  });
});
