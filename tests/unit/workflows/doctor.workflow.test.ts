import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { pathExists } from "../../../src/core/file-system.js";
import { runDoctorWorkflow } from "../../../src/workflows/doctor.workflow.js";
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

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  expect(result.ok).toBe(true);
  return result.ok && result.value;
}

describe("runDoctorWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-doctor-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports missing .visp without creating files", async () => {
    const summary = expectOk(
      await runDoctorWorkflow({
        targetPath: tempDir,
        commandRunner: runner()
      })
    );

    expect(summary.success).toBe(false);
    expect(summary.result).toBe("failed");
    expect(summary.reportPath).toBeNull();
    expect(await readdir(tempDir)).toEqual([]);
  });

  it("writes a report and applies safe directory fixes", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "reports"), { recursive: true, force: true });

    const summary = expectOk(
      await runDoctorWorkflow({
        targetPath: tempDir,
        fix: true,
        commandRunner: runner()
      })
    );

    expect(summary.reportPath).toBe(".visp/reports/doctor-report.md");
    expect(summary.fixesApplied.map((fix) => fix.path)).toContain(".visp/reports");
    expect(await exists(path.join(tempDir, ".visp", "reports", "doctor-report.md"))).toBe(true);
  });

  // D-118 decision 4: a CI workflow generated before the rename runs
  // `visp ...` after installing visp-kit — it breaks at the user's next pull
  // request, so doctor must name it as an error, not pass quietly.
  it("names a stale pre-rename CI workflow as an error", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const workflowDir = path.join(tempDir, ".github", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(
      path.join(workflowDir, "visp-evidence.yml"),
      [
        "name: visp-evidence",
        "jobs:",
        "  evidence:",
        "    steps:",
        "      - name: Install Visp Kit",
        "        run: npm install -g visp-kit@0.2.3",
        "      - name: Validate policy",
        "        run: visp policy validate --json",
        ""
      ].join("\n"),
      "utf8"
    );

    const summary = expectOk(
      await runDoctorWorkflow({
        targetPath: tempDir,
        commandRunner: runner()
      })
    );

    const ciFinding = summary.findings.find(
      (item) => item.file === ".github/workflows/visp-evidence.yml"
    );
    expect(ciFinding).toBeDefined();
    expect(ciFinding?.severity).toBe("error");
    expect(ciFinding?.recommendation).toContain("visp-kit hooks ci --force");
  });

  it("does not flag a regenerated CI workflow", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const workflowDir = path.join(tempDir, ".github", "workflows");
    await mkdir(workflowDir, { recursive: true });
    await writeFile(
      path.join(workflowDir, "visp-evidence.yml"),
      "steps:\n  - run: visp-kit policy validate --json\n",
      "utf8"
    );

    const summary = expectOk(
      await runDoctorWorkflow({
        targetPath: tempDir,
        commandRunner: runner()
      })
    );

    expect(
      summary.findings.find((item) => item.file === ".github/workflows/visp-evidence.yml")
    ).toBeUndefined();
  });

  it("dry-run does not write a report", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(path.join(tempDir, ".visp", "reports"), { recursive: true, force: true });

    const summary = expectOk(
      await runDoctorWorkflow({
        targetPath: tempDir,
        dryRun: true,
        commandRunner: runner()
      })
    );

    expect(summary.reportPath).toBeNull();
    expect(await exists(path.join(tempDir, ".visp", "reports", "doctor-report.md"))).toBe(false);
  });
});
