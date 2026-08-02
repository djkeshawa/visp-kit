import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

async function classifyReadyTask(tempDir: string): Promise<void> {
  const taskGraphPath = path.join(
    tempDir,
    ".visp",
    "features",
    "001-add-note-pinning",
    "task-graph.json"
  );
  const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
    tasks: Array<Record<string, unknown>>;
  };
  taskGraph.tasks[0] = {
    ...taskGraph.tasks[0],
    taskClass: "bounded_feature",
    riskFactors: []
  };
  await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");

  const program = createCli({ writeOut: () => undefined });
  await program.parseAsync(["node", "visp", "tasks", tempDir, "--validate"]);
}

describe("visp-kit status command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-status-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("shows project and feature status", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "status", tempDir]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("Visp status");
    expect(output.join("")).toContain("001-add-note-pinning");
    expect(output.join("")).toContain("Strictness: standard");
    expect(output.join("")).toContain("Policy: valid");
    expect(output.join("")).toContain("Next:");
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    await classifyReadyTask(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "status", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      initialized: boolean;
      activeFeature: { id: string; slug: string; key: string };
      activeTask: { id: string; title: string; status: string };
      featureState: string;
      nextCommand: string;
      strictnessMode: string;
      policyStatus: string;
      nextAllowedCommand: string;
      implementationAllowed: boolean;
      prAllowed: boolean;
      blockedCommands: Array<{ command: string; reason: string; ruleId: string }>;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.initialized).toBe(true);
    expect(summary.activeFeature).toEqual({
      id: "001",
      slug: "add-note-pinning",
      key: "001-add-note-pinning"
    });
    expect(summary.activeTask).toEqual({
      id: "T001",
      title: "Implement note pinning helper",
      status: "ready"
    });
    expect(summary.featureState).toBe("tasks_ready");
    expect(summary.nextCommand).toBe("visp-kit context --next");
    expect(summary.nextAllowedCommand).toBe("visp-kit context --next");
    expect(summary.implementationAllowed).toBe(false);
    expect(summary.prAllowed).toBe(false);
    expect(summary.blockedCommands).toContainEqual({
      command: "implementation",
      reason: "Implementation requires a context pack.",
      ruleId: "VSP007"
    });
    expect(summary.strictnessMode).toBe("standard");
    expect(summary.policyStatus).toBe("valid");
  });

  it("writes a status report only when requested", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });
    const reportPath = path.join(tempDir, ".visp", "reports", "status-report.md");

    expect(await exists(reportPath)).toBe(false);

    await program.parseAsync(["node", "visp", "status", tempDir, "--write-report"]);

    expect(await exists(reportPath)).toBe(true);
    expect(await readFile(reportPath, "utf8")).toContain("# Visp Status");
    expect(await readFile(reportPath, "utf8")).toContain("## Policy");
  });

  it("exits with code 1 when the summary reports failure", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "status",
      tempDir,
      "--feature",
      "does-not-exist",
      "--json"
    ]);

    const summary = JSON.parse(output.join("")) as { success: boolean };

    expect(summary.success).toBe(false);
    expect(process.exitCode).toBe(1);
  });

  it("fails clearly when .visp is missing", async () => {
    const errors: string[] = [];
    const program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "status", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("visp-kit init");
  });
});
