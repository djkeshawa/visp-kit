import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { policyArtifactPath } from "../../../src/artifacts/artifact-paths.js";
import { writeArtifact } from "../../../src/artifacts/artifact-writer.js";
import { policyArtifactSchema } from "../../../src/artifacts/schemas/policy.schema.js";
import { writeJsonFile } from "../../../src/core/file-system.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import {
  defaultPolicyStrictness,
  loadEffectivePolicy,
  readPolicyFile
} from "../../../src/policy/policy-loader.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

describe("policy loader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-policy-loader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("loads effective default policy when policy file is missing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(policyArtifactPath(tempDir), { force: true });

    const loaded = expectOk(
      await loadEffectivePolicy({
        targetPath: tempDir,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(loaded.source).toBe("default");
    expect(loaded.exists).toBe(false);
    expect(loaded.policy.strictnessMode).toBe("standard");
    expect(loaded.warnings.join(" ")).toContain("policy init");
  });

  it("uses config strictness when available", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await writeJsonFile(path.join(tempDir, ".visp", "config.json"), {
      strictnessMode: "strict"
    });

    expect(expectOk(await defaultPolicyStrictness(tempDir))).toBe("strict");
  });

  it("reads persisted policy files", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const policy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    expectOk(
      await writeArtifact(policyArtifactPath(tempDir), policyArtifactSchema, policy, {
        artifactName: "policy"
      })
    );

    const loaded = expectOk(await readPolicyFile(tempDir));

    expect(loaded.source).toBe("file");
    expect(loaded.policy.strictnessMode).toBe("locked");
  });

  it("enforces rule keys a legacy strict policy file omits", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    // Exactly the shape found in the wild: strictnessMode "strict", rules
    // ending at stopOnFailedGate, VSP021-VSP026 never written.
    const legacy = createDefaultPolicy({
      strictnessMode: "strict",
      now: "2026-01-01T00:00:00.000Z"
    });
    const rules: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(legacy.rules)) {
      if (
        [
          "blockOnUnresolvedDrift",
          "preventAssuranceProfileLowering",
          "requireOracleLockBeforeImplementation",
          "requireCurrentAssuranceDecisionBeforePr",
          "requireSignedAssuranceDecision",
          "requireUnderstandingBeforeBehaviouralImplementation"
        ].includes(key)
      ) {
        continue;
      }
      rules[key] = value as boolean;
    }
    await writeJsonFile(policyArtifactPath(tempDir), { ...legacy, rules });

    const loaded = expectOk(await readPolicyFile(tempDir));

    expect(loaded.policy.rules.blockOnUnresolvedDrift).toBe(true);
    expect(loaded.policy.rules.requireCurrentAssuranceDecisionBeforePr).toBe(true);
    expect(loaded.policy.rules.requireSignedAssuranceDecision).toBe(true);
    // Still off: `strict` does not carry VSP023, so resolution must not invent it.
    expect(loaded.policy.rules.requireOracleLockBeforeImplementation).toBe(false);
    expect(loaded.filledRuleKeys).toHaveLength(6);
    expect(loaded.warnings.join(" ")).toContain("visp-kit policy migrate");
  });

  it("turns VSP023 on for a legacy locked policy file that omits it", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const legacy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    const { requireOracleLockBeforeImplementation, ...rules } = legacy.rules;
    expect(requireOracleLockBeforeImplementation).toBe(true);
    await writeJsonFile(policyArtifactPath(tempDir), { ...legacy, rules });

    const loaded = expectOk(await readPolicyFile(tempDir));

    expect(loaded.policy.rules.requireOracleLockBeforeImplementation).toBe(true);
    expect(loaded.filledRuleKeys).toStrictEqual(["requireOracleLockBeforeImplementation"]);
  });

  it("reports no back-fill for a policy file that states every rule", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const policy = createDefaultPolicy({
      strictnessMode: "locked",
      now: "2026-01-01T00:00:00.000Z"
    });
    expectOk(
      await writeArtifact(policyArtifactPath(tempDir), policyArtifactSchema, policy, {
        artifactName: "policy"
      })
    );

    const loaded = expectOk(await readPolicyFile(tempDir));

    expect(loaded.filledRuleKeys).toStrictEqual([]);
    expect(loaded.warnings).toStrictEqual([]);
  });
});
