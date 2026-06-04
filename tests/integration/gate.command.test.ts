import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import {
  gateReportArtifactPath,
  policyArtifactPath
} from "../../src/artifacts/artifact-paths.js";
import { pathExists } from "../../src/core/file-system.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { runPolicySetStrictnessWorkflow } from "../../src/workflows/policy.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp gate command", () => {
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
    expect(result.nextAllowedCommand).toBe("visp init");
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

    expect(result.nextAllowedCommand).toBe("visp policy init --strictness strict");
    expect(process.exitCode).toBe(1);
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

    expect(result.nextAllowedCommand).toBe("visp scan");
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
    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--force"
    ]);

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
