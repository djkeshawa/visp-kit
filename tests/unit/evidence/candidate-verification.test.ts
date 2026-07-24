import { describe, expect, it } from "vitest";

import { type BaselineOracleResult } from "../../../src/artifacts/schemas/baseline-evidence.schema.js";
import { type OraclePlanOracle } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../../../src/artifacts/schemas/verification.schema.js";
import {
  evaluateCandidateOracles,
  evaluateCandidateOutcome
} from "../../../src/workflows/candidate-verification.workflow.js";

function oracle(expected: "failed" | "recorded" = "recorded"): OraclePlanOracle {
  return {
    id: "ORACLE-AC001",
    requirementId: "REQ001",
    acceptanceCriterionId: "AC001",
    description: "Observable behavior.",
    priority: "must",
    validationMethod: "unit",
    baseline: { expected },
    candidate: { expected: "passed" }
  };
}

function baseline(
  expected: "failed" | "recorded",
  observed: "passed" | "failed",
  oracleId = "ORACLE-AC001"
): BaselineOracleResult {
  return {
    oracleId,
    expected,
    observed,
    expectationMet: expected === "recorded" || expected === observed
  };
}

function command(success: boolean, skipped = false): VerificationCommandResult {
  return {
    command: "pnpm test",
    cwd: "/repo",
    exitCode: skipped ? null : success ? 0 : 1,
    success,
    durationMs: 1,
    startedAt: "2026-07-25T00:00:00.000Z",
    endedAt: "2026-07-25T00:00:00.001Z",
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    skipped,
    skipReason: skipped ? "dry-run" : null,
    timedOut: false
  };
}

describe("candidate verification semantics", () => {
  it("passes bug-fix comparison when the failure becomes passing", () => {
    const results = evaluateCandidateOracles({
      oracles: [oracle("failed")],
      baseline: [baseline("failed", "failed")],
      commands: [command(true)]
    });

    expect(results[0]).toMatchObject({
      baseline: { observed: "failed", expectationMet: true },
      candidate: { observed: "passed", expectationMet: true },
      outcome: "passed"
    });
    expect(evaluateCandidateOutcome(results)).toBe("passed");
  });

  it("passes a recorded feature baseline when the candidate passes", () => {
    const results = evaluateCandidateOracles({
      oracles: [oracle()],
      baseline: [baseline("recorded", "failed")],
      commands: [command(true)]
    });

    expect(evaluateCandidateOutcome(results)).toBe("passed");
  });

  it("fails when the candidate command batch fails", () => {
    const results = evaluateCandidateOracles({
      oracles: [oracle()],
      baseline: [baseline("recorded", "passed")],
      commands: [command(false)]
    });

    expect(results[0]).toMatchObject({
      candidate: { observed: "failed", expectationMet: false },
      outcome: "failed"
    });
    expect(evaluateCandidateOutcome(results)).toBe("failed");
  });

  it("is inconclusive when candidate commands do not execute", () => {
    const results = evaluateCandidateOracles({
      oracles: [oracle()],
      baseline: [baseline("recorded", "passed")],
      commands: [command(true, true)]
    });

    expect(evaluateCandidateOutcome(results)).toBe("inconclusive");
  });

  it.each([
    { name: "missing", baseline: [] },
    {
      name: "duplicate",
      baseline: [baseline("recorded", "passed"), baseline("recorded", "passed")]
    },
    { name: "mismatched", baseline: [baseline("failed", "failed")] }
  ])("fails closed for a $name baseline oracle set", ({ baseline: baselineResults }) => {
    const results = evaluateCandidateOracles({
      oracles: [oracle()],
      baseline: baselineResults,
      commands: [command(true)]
    });

    expect(evaluateCandidateOutcome(results)).toBe("inconclusive");
  });
});
