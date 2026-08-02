import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gateResultSchema } from "../../../src/artifacts/schemas/gate.schema.js";
import { policyArtifactPath } from "../../../src/artifacts/artifact-paths.js";
import { evaluateGate } from "../../../src/gates/gate-engine.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { runPolicySetStrictnessWorkflow } from "../../../src/workflows/policy.workflow.js";
import { createPhase8Fixture, expectOk } from "../../integration/phase8-fixture.js";

describe("gate engine", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-gate-engine-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("recommends init when next gate runs before initialization", async () => {
    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "next",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.nextAllowedCommand).toBe("visp-kit init");
    expect(result.failedRules[0]?.ruleId).toBe("VSP018");
    expect(gateResultSchema.safeParse(result).success).toBe(true);
  });

  it("uses default policy when policy.json is missing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(policyArtifactPath(tempDir), { force: true });

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "setup",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.strictnessMode).toBe("standard");
    expect(result.failedRules.some((rule) => rule.ruleId === "VSP018")).toBe(true);
    expect(result.allowed).toBe(true);
  });

  it("strictness override affects only the current evaluation", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "spec",
        strictness: "strict",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "setup",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.strictnessMode).toBe("standard");
  });

  it("refuses to lower strictness below the policy file", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "locked",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "implement",
        taskId: "T001",
        strictness: "relaxed",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    // The gate must stay blocked and keep reporting the policy's own mode:
    // a runtime flag cannot void the policy file.
    expect(result.allowed).toBe(false);
    expect(result.strictnessMode).toBe("locked");
    expect(result.failedRules.some((rule) => rule.ruleId === "VSP018")).toBe(true);
    expect(result.failedRules.map((rule) => rule.evidence).join("\n")).toContain(
      "cannot weaken policy"
    );
  });

  it("preserves the assurance profile when strictness is raised", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    const policy = JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8"));
    policy.assurance = { profile: "critical" };
    await writeFile(policyArtifactPath(tempDir), `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "implement",
        taskId: "T001",
        strictness: "locked",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.strictnessMode).toBe("locked");
    // Raising strictness must not discard project settings the presets do not
    // model; dropping this is what disabled VSP022/VSP023.
    expect(result.policyAssuranceProfile).toBe("critical");
  });

  it("blocks implement when strict policy requires missing context", async () => {
    await createPhase8Fixture(tempDir);
    expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const result = expectOk(
      await evaluateGate({
        targetPath: tempDir,
        stage: "implement",
        taskId: "T001",
        dryRun: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(result.allowed).toBe(false);
    expect(result.failedRules.map((rule) => rule.ruleId)).toContain("VSP007");
    expect(result.blockedCommands[0]?.command).toBe("implementation");
  });
});
