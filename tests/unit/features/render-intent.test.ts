import { describe, expect, it } from "vitest";

import {
  knownConstraintsFromCompactConstitution,
  projectContextFromSummary,
  renderIntentMarkdown
} from "../../../src/features/render-intent.js";

describe("renderIntentMarkdown", () => {
  it("renders compact intent markdown without detailed requirements", () => {
    const markdown = renderIntentMarkdown({
      title: "Add note pinning",
      rawUserRequest: "Add note pinning"
    });

    expect(markdown).toContain("# Feature Intent: Add note pinning");
    expect(markdown).toContain("## User Request");
    expect(markdown).toContain("Add note pinning");
    expect(markdown).toContain("## Known Constraints");
    expect(markdown).toContain("Follow the existing project architecture.");
    expect(markdown).toContain("## Unknowns");
    expect(markdown).toContain("visp-kit clarify");
    expect(markdown).not.toContain("## Acceptance Criteria");
  });

  it("can include short project context from scan summary", () => {
    const context = projectContextFromSummary(`# Project Summary

- Package manager: pnpm
- Project name: notes
- Languages: TypeScript (8)
- Frameworks: React via react
- Test roots: tests
`);

    expect(context).toBe(
      "- Project name: notes\n- Languages: TypeScript (8)\n- Frameworks: React via react"
    );
  });

  it("extracts only a short set of compact constitution rules", () => {
    const constraints = knownConstraintsFromCompactConstitution(`C001: Keep functions small.
C002: Follow existing structure.
C003: Avoid unrelated refactoring.
C004: Keep context compact.
`);

    expect(constraints).toContain("Constitution C001: Keep functions small.");
    expect(constraints).toContain("Constitution C003: Avoid unrelated refactoring.");
    expect(constraints).not.toContain("Constitution C004: Keep context compact.");
  });
});
