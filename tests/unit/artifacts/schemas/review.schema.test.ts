import { describe, expect, it } from "vitest";

import { reviewReportSchema } from "../../../../src/artifacts/schemas/review.schema.js";
import { validReviewReport } from "../fixtures.js";

describe("review schema", () => {
  it("accepts valid review reports", () => {
    expect(reviewReportSchema.safeParse(validReviewReport).success).toBe(true);
  });

  it("rejects invalid finding severities", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      findings: [
        {
          ...validReviewReport.findings[0],
          severity: "blocker"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("accepts a review report that states the scope it examined", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      scopeBasis: {
        kind: "working-tree",
        description: "Uncommitted working tree (git diff source: unstaged).",
        diffSource: "unstaged",
        baseRef: null,
        filesExamined: 1,
        examinedFiles: ["src/notes.ts"],
        reviewableFiles: ["src/notes.ts"],
        empty: false
      }
    });

    expect(result.success).toBe(true);
  });

  it("still accepts a review report written before the scope basis existed", () => {
    expect("scopeBasis" in validReviewReport).toBe(false);
    expect(reviewReportSchema.safeParse(validReviewReport).success).toBe(true);
  });

  it("rejects an unknown scope basis kind rather than guessing", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      scopeBasis: {
        kind: "whole-repository",
        description: "Everything.",
        diffSource: "unstaged",
        baseRef: null,
        filesExamined: 0,
        examinedFiles: [],
        reviewableFiles: [],
        empty: true
      }
    });

    expect(result.success).toBe(false);
  });

  it("rejects negative diff counts", () => {
    const result = reviewReportSchema.safeParse({
      ...validReviewReport,
      changedFiles: [
        {
          ...validReviewReport.changedFiles[0],
          additions: -1
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
