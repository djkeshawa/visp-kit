import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type StrictnessMode } from "../../../src/artifacts/schemas/policy.schema.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import {
  understandingExportExists,
  understandingGateActive
} from "../../../src/understanding/understanding-activation.js";

const NOW = "2026-01-01T00:00:00.000Z";
const strictnessModes: readonly StrictnessMode[] = ["relaxed", "standard", "strict", "locked"];

function policyFor(mode: StrictnessMode) {
  return createDefaultPolicy({ strictnessMode: mode, now: NOW });
}

describe("understandingGateActive", () => {
  it("is off in every preset when nothing has been exported", () => {
    // The decision recorded in policy-defaults.ts: VSP026 is deliberately off
    // in all four presets, `locked` included, because its precondition is an
    // artifact only `visp-intel` writes and no Kit command can supply. This
    // asserts the decision so a future sweep reads a choice, not a gap.
    for (const mode of strictnessModes) {
      expect(
        understandingGateActive({ policy: policyFor(mode), understandingExportExists: false })
      ).toBe(false);
    }
  });

  it("activates on an exported case at every strictness, policy untouched", () => {
    // Asymmetry 2. Before this, VSP026 activated on nothing: a project that had
    // actually run intel and exported a case still got no gate without a
    // hand-edited policy file.
    for (const mode of strictnessModes) {
      expect(
        understandingGateActive({ policy: policyFor(mode), understandingExportExists: true })
      ).toBe(true);
    }
  });

  it("activates on the policy rule with no export on disk", () => {
    const policy = policyFor("standard");

    expect(
      understandingGateActive({
        policy: {
          ...policy,
          rules: { ...policy.rules, requireUnderstandingBeforeBehaviouralImplementation: true }
        },
        understandingExportExists: false
      })
    ).toBe(true);
  });

  it("does not activate on an assurance profile", () => {
    // VSP023's third trigger, deliberately not copied. An assurance profile
    // asks for oracle evidence, which Kit produces; it says nothing about
    // whether intel has ever run, so honouring it here would block an
    // assurance project that has no way to satisfy the gate.
    const policy = policyFor("standard");

    expect(
      understandingGateActive({
        policy: { ...policy, assurance: { profile: "critical" } },
        understandingExportExists: false
      })
    ).toBe(false);
  });
});

describe("understandingExportExists", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-vsp026-activation-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("is false when intel has never run", async () => {
    expect(await understandingExportExists({ targetPath: tempDir, taskId: "T001" })).toBe(false);
  });

  it("is true for an export that exists", async () => {
    await mkdir(path.join(tempDir, ".visp-intel", "understanding"), { recursive: true });
    await writeFile(path.join(tempDir, ".visp-intel", "understanding", "T001.json"), "{}", "utf8");

    expect(await understandingExportExists({ targetPath: tempDir, taskId: "T001" })).toBe(true);
  });

  it("is keyed on the task, not on intel having run at all", async () => {
    await mkdir(path.join(tempDir, ".visp-intel", "understanding"), { recursive: true });
    await writeFile(path.join(tempDir, ".visp-intel", "understanding", "T001.json"), "{}", "utf8");

    expect(await understandingExportExists({ targetPath: tempDir, taskId: "T002" })).toBe(false);
  });

  it("is true for unusable content, so a broken export cannot switch the gate off", async () => {
    // Presence, not validity — the same contract `oraclePlanExists` has. A
    // corrupt export activates the gate and then fails G1, rather than
    // silently returning the task to the ungated default.
    await mkdir(path.join(tempDir, ".visp-intel", "understanding"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".visp-intel", "understanding", "T001.json"),
      "not json at all",
      "utf8"
    );

    expect(await understandingExportExists({ targetPath: tempDir, taskId: "T001" })).toBe(true);
  });

  it("refuses to interpolate a task id that cannot name a file", async () => {
    expect(
      await understandingExportExists({ targetPath: tempDir, taskId: "../../etc/passwd" })
    ).toBe(false);
  });
});
