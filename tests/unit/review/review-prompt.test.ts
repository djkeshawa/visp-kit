import { describe, expect, it } from "vitest";

import { renderReviewPrompt } from "../../../src/review/review-prompt.js";
import { validReviewReport } from "../artifacts/fixtures.js";

describe("review prompt renderer", () => {
  it("references context and review report paths", () => {
    const prompt = renderReviewPrompt({
      report: validReviewReport,
      taskTitle: "Add note sorting helper",
      contextPath: ".visp/features/001-note-pinning/context/T001.context.md",
      verificationPath: ".visp/features/001-note-pinning/verification.md",
      reviewReportPath: ".visp/features/001-note-pinning/review/T001.review.md"
    });

    expect(prompt).toContain(".visp/features/001-note-pinning/context/T001.context.md");
    expect(prompt).toContain(".visp/features/001-note-pinning/review/T001.review.md");
    expect(prompt).toContain("T001 - Add note sorting helper");
  });
});
