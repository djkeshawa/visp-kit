import { describe, expect, it } from "vitest";

import {
  buildEvaluationCoverage,
  inspectionFindings,
  noChecksPerformedFinding,
  ran,
  skipped
} from "../../../src/evaluation/evaluation-coverage.js";
import { evaluationResult } from "../../../src/evaluation/evaluation-report.js";

const warning = {
  category: "workflow" as const,
  severity: "warning" as const,
  title: "No active feature",
  description: "Evaluation is limited because no active feature is selected.",
  recommendation: 'Run visp-kit feature "<idea>".',
  file: ".visp/status.json"
};

describe("buildEvaluationCoverage", () => {
  it("counts the checks that ran and names the ones that could not", () => {
    const coverage = buildEvaluationCoverage([
      ran("project initialization", []),
      skipped("task traceability", "no task graph artifact is available")
    ]);

    expect(coverage.checksPerformed).toBe(1);
    expect(coverage.performedChecks).toEqual(["project initialization"]);
    expect(coverage.skippedChecks).toEqual([
      { inspection: "task traceability", reason: "no task graph artifact is available" }
    ]);
    expect(coverage.empty).toBe(false);
  });

  it("separates a clean check from a check that never ran", () => {
    // The distinction LC-108 was about: before it, both produced an empty
    // findings list and printed `Checks: 0` under `Result: passed`.
    const clean = buildEvaluationCoverage([ran("review evidence", [])]);
    const absent = buildEvaluationCoverage([skipped("review evidence", "no review report")]);

    expect(clean.empty).toBe(false);
    expect(absent.empty).toBe(true);
    expect(absent.description).toContain("rests on nothing");
  });

  it("reports an evaluation that inspected nothing as empty", () => {
    expect(buildEvaluationCoverage([]).empty).toBe(true);
  });
});

describe("inspectionFindings", () => {
  it("collects findings from the checks that ran and nothing from the ones that did not", () => {
    expect(
      inspectionFindings([ran("active feature", [warning]), skipped("pr readiness", "no PR")])
    ).toEqual([warning]);
  });
});

describe("noChecksPerformedFinding", () => {
  it("fails the evaluation rather than passing it, and says why nothing ran", () => {
    const coverage = buildEvaluationCoverage([
      skipped("review evidence", "no review report has been produced")
    ]);
    const finding = noChecksPerformedFinding(coverage);

    expect(finding.severity).toBe("error");
    expect(evaluationResult([{ id: "EVAL001", ...finding }])).toBe("failed");
    expect(finding.description).toContain("review evidence: no review report has been produced");
  });

  it("still states a reason when no inspection was even attempted", () => {
    expect(noChecksPerformedFinding(buildEvaluationCoverage([])).description).toContain(
      "No inspection was attempted."
    );
  });
});
