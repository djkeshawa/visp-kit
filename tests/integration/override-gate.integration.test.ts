import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { evaluateGate } from "../../src/gates/gate-engine.js";
import { runPolicySetStrictnessWorkflow } from "../../src/workflows/policy.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

describe("policy overrides in gates", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-override-gate-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("allows review with warning when VSP014 is overridden for the selected task", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const blocked = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "review",
        taskId: "T001",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(blocked.allowed).toBe(false);
    expect(blocked.failedRules.map((rule) => rule.ruleId)).toContain("VSP014");

    const program = createCli({ writeOut: () => undefined });
    await program.parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP014",
      tempDir,
      "--scope",
      "task",
      "--feature",
      "001",
      "--task",
      "T001",
      "--stage",
      "review",
      "--reason",
      "Prototype branch has no automated verification yet; manual validation is documented."
    ]);

    const allowed = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "review",
        taskId: "T001",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(allowed.allowed).toBe(true);
    expect(allowed.overriddenRules).toEqual(["VSP014"]);
    expect(allowed.appliedOverrides[0]?.overrideId).toBe("OVR001");
    expect(allowed.failedRules.find((rule) => rule.ruleId === "VSP014")?.severity).toBe("warning");
    expect(allowed.blockedCommands).toEqual([]);

    await program.parseAsync([
      "node",
      "visp",
      "override",
      "revoke",
      "OVR001",
      tempDir,
      "--reason",
      "Automated verification is now required before review."
    ]);

    const blockedAgain = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "review",
        taskId: "T001",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(blockedAgain.allowed).toBe(false);
    expect(blockedAgain.appliedOverrides).toEqual([]);
  });
});
