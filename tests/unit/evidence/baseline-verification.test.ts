import { describe, expect, it } from "vitest";

import { type OraclePlanOracle } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../../../src/artifacts/schemas/verification.schema.js";
import {
  evaluateBaselineOracles,
  evaluateBaselineOutcome
} from "../../../src/workflows/baseline-verification.workflow.js";

function oracle(expected: "failed" | "recorded"): OraclePlanOracle {
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

function command(success: boolean): VerificationCommandResult {
  return {
    command: "pnpm test",
    cwd: "/repo",
    exitCode: success ? 0 : 1,
    success,
    durationMs: 1,
    startedAt: "2026-07-25T00:00:00.000Z",
    endedAt: "2026-07-25T00:00:00.001Z",
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    skipped: false,
    skipReason: null,
    timedOut: false
  };
}

describe("baseline verification semantics", () => {
  it("accepts a reproduced failing baseline for localized bugs", () => {
    const results = evaluateBaselineOracles({
      oracles: [oracle("failed")],
      commands: [command(false)]
    });

    expect(results[0]).toMatchObject({ observed: "failed", expectationMet: true });
    expect(evaluateBaselineOutcome(results)).toBe("passed");
  });

  it("rejects a localized-bug baseline that already passes", () => {
    const results = evaluateBaselineOracles({
      oracles: [oracle("failed")],
      commands: [command(true)]
    });

    expect(results[0]).toMatchObject({ observed: "passed", expectationMet: false });
    expect(evaluateBaselineOutcome(results)).toBe("failed");
  });

  it("records either observed result for feature baselines", () => {
    const results = evaluateBaselineOracles({
      oracles: [oracle("recorded")],
      commands: [command(false)]
    });

    expect(results[0]).toMatchObject({ observed: "failed", expectationMet: true });
    expect(evaluateBaselineOutcome(results)).toBe("passed");
  });
});
