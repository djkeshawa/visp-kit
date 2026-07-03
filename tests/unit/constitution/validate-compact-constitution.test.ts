import { describe, expect, it } from "vitest";

import { validateCompactConstitution } from "../../../src/constitution/validate-compact-constitution.js";

describe("validateCompactConstitution", () => {
  it("passes valid compact rules", () => {
    const result = validateCompactConstitution("C001: Keep functions small.\nC002: Write tests.\n");

    expect(result).toEqual({ passed: true, ruleCount: 2, errors: [] });
  });

  it("fails malformed rule IDs", () => {
    const result = validateCompactConstitution("C001: First.\nX002: Second.\n");

    expect(result.passed).toBe(false);
    expect(result.errors[0]).toContain("Invalid rule ID at line 2");
  });

  it("fails duplicate IDs and duplicate rule text", () => {
    const result = validateCompactConstitution("C001: Same.\nC001: Same.\n");

    expect(result.passed).toBe(false);
    expect(result.errors).toContain("Duplicate rule ID C001.");
    expect(result.errors).toContain("Duplicate rule text at C001.");
  });

  it("fails empty rule text and empty files", () => {
    expect(validateCompactConstitution("C001:   \n").errors).toContain("Rule C001 has empty text.");
    expect(validateCompactConstitution("\n").errors).toContain(
      "Compact constitution must contain at least one rule."
    );
  });
});
