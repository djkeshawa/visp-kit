import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { policyArtifactPath } from "../../../src/artifacts/artifact-paths.js";
import { pathExists } from "../../../src/core/file-system.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import {
  runPolicyInitWorkflow,
  runPolicySetStrictnessWorkflow,
  runPolicyShowWorkflow,
  runPolicyValidateWorkflow
} from "../../../src/workflows/policy.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok result.");
  return result.value;
}

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("policy workflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-policy-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("initializes policy files with selected strictness", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runPolicyInitWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    expect(summary.success).toBe(true);
    expect(summary.created).toBe(true);
    expect(summary.policy.strictnessMode).toBe("strict");
    expect(await exists(policyArtifactPath(tempDir))).toBe(true);
  });

  it("does not overwrite existing policy without force", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(await runPolicyInitWorkflow({ targetPath: tempDir }));

    const second = await runPolicyInitWorkflow({ targetPath: tempDir });

    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error.message).toContain("--force");
    }
  });

  it("supports dry-run without writing policy files", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runPolicyInitWorkflow({
        targetPath: tempDir,
        strictness: "locked",
        dryRun: true
      })
    );

    expect(summary.dryRun).toBe(true);
    expect(summary.policy.strictnessMode).toBe("locked");
    expect(await exists(policyArtifactPath(tempDir))).toBe(false);
  });

  it("shows effective default when policy is missing", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(await runPolicyShowWorkflow({ targetPath: tempDir }));

    expect(summary.source).toBe("default");
    expect(summary.policy.strictnessMode).toBe("standard");
    expect(summary.nextCommand).toBe("visp policy init");
  });

  it("validates existing policy and updates strictness", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runPolicyInitWorkflow({
        targetPath: tempDir,
        strictness: "strict",
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const validate = expectOk(await runPolicyValidateWorkflow({ targetPath: tempDir }));
    expect(validate.validation.passed).toBe(true);

    const update = expectOk(
      await runPolicySetStrictnessWorkflow({
        targetPath: tempDir,
        strictness: "locked",
        now: "2026-01-02T00:00:00.000Z"
      })
    );

    expect(update.policy.strictnessMode).toBe("locked");
    expect(update.policy.limits.maxChangedFilesPerTask).toBe(8);
    expect(update.policy.overrides.allowed).toBe(true);

    const persisted = JSON.parse(await readFile(policyArtifactPath(tempDir), "utf8")) as {
      strictnessMode: string;
      updatedAt: string;
    };
    expect(persisted.strictnessMode).toBe("locked");
    expect(persisted.updatedAt).toBe("2026-01-02T00:00:00.000Z");
  });
});
