import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { gateReportArtifactPath, policyArtifactPath } from "../../src/artifacts/artifact-paths.js";
import { pathExists } from "../../src/core/file-system.js";
import {
  taskImplementMarkerPath,
  implementMarkerDirPath
} from "../../src/gates/implement-marker.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { runPolicySetStrictnessWorkflow } from "../../src/workflows/policy.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp-kit gate command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-gate-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("recommends init for next gate when .visp is missing", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "gate", "next", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      allowed: boolean;
      nextAllowedCommand: string;
    };

    expect(errors.join("")).toBe("");
    expect(result.allowed).toBe(false);
    expect(result.nextAllowedCommand).toBe("visp-kit init");
    expect(process.exitCode).toBe(1);
  });

  it("recommends policy init when policy is missing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(policyArtifactPath(tempDir), { force: true });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "next", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      nextAllowedCommand: string;
    };

    expect(result.nextAllowedCommand).toBe("visp-kit policy init --strictness strict");
    expect(process.exitCode).toBe(1);
  });

  it("rejects an existing malformed policy without inferring workflow permission", async () => {
    await createPhase8Fixture(tempDir);
    await writeFile(policyArtifactPath(tempDir), "{ malformed policy", "utf8");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "next", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: Array<{ ruleId: string; message: string }>;
      nextCommand: string;
      blockedCommands: Array<{ command: string; ruleId: string }>;
    };

    expect(result.allowed).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(result.failedRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ruleId: "VSP018", message: "Policy validation failed." })
      ])
    );
    expect(result.nextCommand).toBe("visp-kit policy validate");
    expect(result.blockedCommands).toEqual([
      expect.objectContaining({ command: "workflow progression", ruleId: "VSP018" })
    ]);
  });

  it("recommends scan when strict policy requires scan", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "next", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      nextAllowedCommand: string;
      failedRules: Array<{ ruleId: string }>;
    };

    expect(result.nextAllowedCommand).toBe("visp-kit scan");
    expect(result.failedRules.map((rule) => rule.ruleId)).toContain("VSP001");
    expect(process.exitCode).toBe(1);
  });

  it("blocks implement without context and allows it after context exists", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);
    const blocked = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: Array<{ ruleId: string }>;
    };

    expect(blocked.allowed).toBe(false);
    expect(blocked.failedRules.map((rule) => rule.ruleId)).toContain("VSP007");
    expect(process.exitCode).toBe(1);
    expect(await exists(gateReportArtifactPath(tempDir))).toBe(true);

    process.exitCode = undefined;
    output.length = 0;
    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);
    const allowed = JSON.parse(output.join("")) as { allowed: boolean };

    expect(allowed.allowed).toBe(true);
    expect(process.exitCode).toBeUndefined();
  });

  it("blocks a second task whose scope overlaps an active authorization", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    // Give T001 a concrete scope so overlap detection has real paths.
    const taskGraphPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "task-graph.json"
    );
    const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
      tasks: Array<{ id: string; allowedFiles: string[] }>;
    };

    taskGraph.tasks[0] = { ...taskGraph.tasks[0], allowedFiles: ["src/notes.ts"] } as never;
    await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");

    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    // Simulate another agent's active authorization sharing src/notes.ts.
    await mkdir(implementMarkerDirPath(tempDir), { recursive: true });
    await writeFile(
      taskImplementMarkerPath(tempDir, "T998"),
      JSON.stringify({
        version: "1.0",
        taskId: "T998",
        featureId: "001",
        strictnessMode: "strict",
        allowedFiles: ["src/notes.ts"],
        expectedFiles: [],
        forbiddenFiles: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      }),
      "utf8"
    );

    const output: string[] = [];
    const gateProgram = createCli({ writeOut: (value) => output.push(value) });

    await gateProgram.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);

    const result = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: Array<{ ruleId: string; message: string }>;
    };

    expect(result.allowed).toBe(false);
    expect(
      result.failedRules.some((rule) => rule.ruleId === "VSP012" && rule.message.includes("T998"))
    ).toBe(true);
  });

  it("allows concurrent authorizations with disjoint scopes", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const taskGraphPath = path.join(
      tempDir,
      ".visp",
      "features",
      "001-add-note-pinning",
      "task-graph.json"
    );
    const taskGraph = JSON.parse(await readFile(taskGraphPath, "utf8")) as {
      tasks: Array<{ id: string; allowedFiles: string[]; parallelizable: boolean }>;
    };

    taskGraph.tasks[0] = {
      ...taskGraph.tasks[0],
      allowedFiles: ["src/notes.ts"],
      parallelizable: true
    } as never;
    await writeFile(taskGraphPath, `${JSON.stringify(taskGraph, null, 2)}\n`, "utf8");

    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    await mkdir(implementMarkerDirPath(tempDir), { recursive: true });
    await writeFile(
      taskImplementMarkerPath(tempDir, "T998"),
      JSON.stringify({
        version: "1.0",
        taskId: "T998",
        featureId: "001",
        strictnessMode: "strict",
        allowedFiles: ["src/other-module.ts"],
        expectedFiles: [],
        forbiddenFiles: [],
        createdAt: "2026-01-01T00:00:00.000Z"
      }),
      "utf8"
    );

    const output: string[] = [];
    const gateProgram = createCli({ writeOut: (value) => output.push(value) });

    await gateProgram.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--json"
    ]);

    const result = JSON.parse(output.join("")) as { allowed: boolean };

    expect(result.allowed).toBe(true);
    expect(await exists(taskImplementMarkerPath(tempDir, "T001"))).toBe(true);
    expect(await exists(taskImplementMarkerPath(tempDir, "T998"))).toBe(true);
  });

  it("blocks pr when verification, review, and reconcile evidence are missing", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "pr", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      allowed: boolean;
      failedRules: Array<{ ruleId: string }>;
    };

    expect(result.allowed).toBe(false);
    expect(result.failedRules.map((rule) => rule.ruleId)).toEqual(
      expect.arrayContaining(["VSP014", "VSP015", "VSP016"])
    );
    expect(process.exitCode).toBe(1);
  });

  it("emits both a nextAllowedCommand sentence and a bare nextCommand", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "gate", "pr", tempDir, "--json"]);

    const result = JSON.parse(output.join("")) as {
      nextAllowedCommand: string;
      nextCommand: string;
    };

    // The prose form is a full sentence; the bare form is a runnable command.
    expect(result.nextAllowedCommand).toMatch(/^Run visp-kit /);
    expect(result.nextCommand).toBeDefined();
    expect(result.nextCommand).not.toMatch(/^Run /);
    expect(result.nextCommand.endsWith(".")).toBe(false);
    expect(result.nextCommand).toBe(
      result.nextAllowedCommand.replace(/^Run /, "").replace(/\.$/, "")
    );
    expect(result.nextCommand.startsWith("visp-kit ")).toBe(true);
  });

  it("dry-run writes no gate report", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    await rm(gateReportArtifactPath(tempDir), { force: true });
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "gate",
      "implement",
      tempDir,
      "--task",
      "T001",
      "--dry-run"
    ]);

    expect(await exists(gateReportArtifactPath(tempDir))).toBe(false);
  });
});
