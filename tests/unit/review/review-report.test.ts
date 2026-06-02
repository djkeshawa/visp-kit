import { describe, expect, it } from "vitest";

import { renderReviewMarkdown } from "../../../src/review/review-report.js";
import { validReviewReport } from "../artifacts/fixtures.js";

describe("review report renderer", () => {
  it("includes findings", () => {
    const markdown = renderReviewMarkdown(validReviewReport);

    expect(markdown).toContain("# Review Report");
    expect(markdown).toContain("REVIEW001");
    expect(markdown).toContain("No test files changed");
  });
});
