import { describe, expect, it } from "vitest";

import { evaluationResult } from "../../../src/evaluation/evaluation-report.js";
import { type EvaluationCheck } from "../../../src/artifacts/schemas/evaluation.schema.js";

function check(severity: EvaluationCheck["severity"]): EvaluationCheck {
  return {
    id: "EVAL001",
    category: "workflow",
    severity,
    title: "Check",
    description: "Description",
    recommendation: "Recommendation",
    file: null
  };
}

describe("evaluation result", () => {
  it("fails when any check is an error", () => {
    expect(evaluationResult([check("warning"), check("error")])).toBe("failed");
  });

  it("warns when checks contain warnings only", () => {
    expect(evaluationResult([check("info"), check("warning")])).toBe("warnings");
  });

  it("passes when no blocking checks exist", () => {
    expect(evaluationResult([check("info")])).toBe("passed");
  });
});
