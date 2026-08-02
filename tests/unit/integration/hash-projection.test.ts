// P10-US-01 (D-119): identity hashes must survive a change of command wording.
//
// The 3.4 / canonical-1.3 action identity and the 1.1 assurance case hash are
// computed over projections that exclude command wording. These tests pin the
// core guarantee of the migration: rename every command string and the
// identity does not move; change anything semantic and it does.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assuranceCaseHashProjectionV1_1,
  projectFinding,
  workflowActionHashProjectionV1_3
} from "../../../src/integration/hash-projection.js";
import {
  createAssuranceCaseHash,
  createAssuranceCaseHashV1_1
} from "../../../src/assurance/assurance-case-hash.js";

const sha = (character: string) => `sha256:${character.repeat(64)}`;

describe("workflowActionHashProjectionV1_3", () => {
  // DELIBERATE OLD VOCABULARY — do not mechanically rename. This input plays
  // the pre-rename artifact; the test below contrasts it against the renamed
  // form, and renaming both sides would make the invariance check trivial.
  const identityInput = {
    canonicalVersion: "1.3",
    phase: "implement",
    taskId: "T001",
    goal: "Implement pinned-first sorting.",
    nextCommand: "visp gate implement --task T001",
    findings: [
      {
        code: "VSP007",
        source: "policy",
        severity: "error",
        effect: "blocks",
        message: "Run `visp context T001` before implementing.",
        recommendation: "Re-run visp gate implement --task T001.",
        evidence: ["visp gate implement --task T001"]
      }
    ]
  };

  it("removes nextCommand and finding wording, keeping finding identity", () => {
    const projected = workflowActionHashProjectionV1_3(identityInput);
    expect(projected).not.toHaveProperty("nextCommand");
    expect(projected.findings).toEqual([
      { code: "VSP007", source: "policy", severity: "error", effect: "blocks" }
    ]);
    expect(projected.goal).toBe("Implement pinned-first sorting.");
  });

  it("is invariant under a command rename and sensitive to semantic change", () => {
    const renamed = {
      ...identityInput,
      nextCommand: "visp-kit gate implement --task T001",
      findings: [
        {
          ...identityInput.findings[0]!,
          message: "Run `visp-kit context T001` before implementing.",
          recommendation: "Re-run visp-kit gate implement --task T001.",
          evidence: ["visp-kit gate implement --task T001"]
        }
      ]
    };
    expect(workflowActionHashProjectionV1_3(renamed)).toEqual(
      workflowActionHashProjectionV1_3(identityInput)
    );

    const semanticChange = { ...identityInput, goal: "A different goal." };
    expect(workflowActionHashProjectionV1_3(semanticChange)).not.toEqual(
      workflowActionHashProjectionV1_3(identityInput)
    );

    const findingChange = {
      ...identityInput,
      findings: [{ ...identityInput.findings[0]!, severity: "warning" as const }]
    };
    expect(workflowActionHashProjectionV1_3(findingChange)).not.toEqual(
      workflowActionHashProjectionV1_3(identityInput)
    );
  });

  it("projects a finding to exactly its semantic identity", () => {
    expect(
      projectFinding({
        code: "VSP001",
        source: "workflow",
        severity: "info",
        effect: "none",
        message: "wording",
        recommendation: "wording",
        evidence: ["wording"]
      })
    ).toEqual({ code: "VSP001", source: "workflow", severity: "info", effect: "none" });
  });
});

describe("assurance case hash generations", () => {
  // DELIBERATE OLD VOCABULARY — the pre-rename side of the contrast below.
  const caseBody = {
    version: "1.1",
    actionId: sha("0"),
    featureId: "F001",
    taskId: "T001",
    verdict: "passed",
    nextAction: {
      command: "visp review --task T001",
      reason: "The case passed; a human review is next."
    }
  } as never;

  it("canonical-1.1 excludes nextAction: a rename cannot move the hash", () => {
    const renamed = {
      ...(caseBody as Record<string, unknown>),
      nextAction: {
        command: "visp-kit review --task T001",
        reason: "Renamed wording, same meaning."
      }
    } as never;
    expect(createAssuranceCaseHashV1_1(renamed)).toBe(createAssuranceCaseHashV1_1(caseBody));
  });

  it("canonical-1.1 still moves on semantic change", () => {
    const changed = { ...(caseBody as Record<string, unknown>), verdict: "failed" } as never;
    expect(createAssuranceCaseHashV1_1(changed)).not.toBe(createAssuranceCaseHashV1_1(caseBody));
  });

  it("the 1.0 rule is untouched: full-body hash, wording included", () => {
    const renamed = {
      ...(caseBody as Record<string, unknown>),
      version: "1.0",
      nextAction: { command: "visp-kit review --task T001", reason: "renamed" }
    } as never; // renamed relative to caseBody's old-vocabulary nextAction
    const original = { ...(caseBody as Record<string, unknown>), version: "1.0" } as never;
    expect(createAssuranceCaseHash(renamed)).not.toBe(createAssuranceCaseHash(original));
  });

  it("the two generations never share a hash for identical bodies", () => {
    expect(createAssuranceCaseHashV1_1(caseBody)).not.toBe(createAssuranceCaseHash(caseBody));
  });

  it("projection removes nextAction and nothing else", () => {
    const projected = assuranceCaseHashProjectionV1_1(caseBody as Record<string, unknown>);
    expect(projected).not.toHaveProperty("nextAction");
    expect(Object.keys(projected).sort()).toEqual([
      "actionId",
      "featureId",
      "taskId",
      "verdict",
      "version"
    ]);
  });
});

describe("workflow action 3.4 end to end", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "visp-hash-projection-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("the actionId survives a rename of every command string in the step", async () => {
    const { buildWorkflowAction } = await import("../../../src/integration/workflow-action.js");
    const { projectState, actionStep, writeReadFixtures } = await import(
      "./workflow-action-fixture.js"
    );
    await writeReadFixtures(tempDir);

    const original = await buildWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir),
      protocol: "3.4",
      now: "2026-08-03T00:00:00.000Z"
    });
    const renamed = await buildWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        nextCommand: "visp-kit renamed-wording --task T001",
        nextAllowedCommand: "visp-kit renamed-wording --task T001"
      }),
      protocol: "3.4",
      now: "2026-08-03T00:00:00.000Z"
    });

    if (!("actionId" in original) || !("actionId" in renamed)) {
      throw new Error("3.4 actions must carry an actionId.");
    }
    expect(original.protocolVersion).toBe("3.4");
    expect(original.canonicalVersion).toBe("1.3");
    expect(renamed.actionId).toBe(original.actionId);
    expect(renamed.nextCommand).not.toBe(original.nextCommand);

    // The same wording change at 3.2 moves the identity — that is the defect
    // 3.4 exists to close, kept here as the contrast that proves the fix.
    const original32 = await buildWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir),
      protocol: "3.2",
      now: "2026-08-03T00:00:00.000Z"
    });
    const renamed32 = await buildWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        nextCommand: "visp-kit renamed-wording --task T001",
        nextAllowedCommand: "visp-kit renamed-wording --task T001"
      }),
      protocol: "3.2",
      now: "2026-08-03T00:00:00.000Z"
    });
    if (!("actionId" in original32) || !("actionId" in renamed32)) {
      throw new Error("3.2 actions must carry an actionId.");
    }
    expect(renamed32.actionId).not.toBe(original32.actionId);
  });
});
