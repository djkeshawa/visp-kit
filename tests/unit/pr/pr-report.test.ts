import { describe, expect, it } from "vitest";

import { renderPrMarkdown } from "../../../src/pr/pr-report.js";
import { validPrArtifact } from "../artifacts/fixtures.js";

describe("PR report renderer", () => {
  it("includes requirements, tasks, validation, and checklist", () => {
    const markdown = renderPrMarkdown(validPrArtifact);

    expect(markdown).toContain("# Pull Request: Add note pinning");
    expect(markdown).toContain("REQ-001");
    expect(markdown).toContain("T001");
    expect(markdown).toContain("Verification: ready");
    expect(markdown).toContain("- [ ] Requirements are covered.");
  });
});
