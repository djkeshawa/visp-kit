import { describe, expect, it } from "vitest";

import { budgetGuidance, presetGuidance } from "../../../src/constitution/constitution-presets.js";
import { buildConstitutionRules } from "../../../src/constitution/constitution-rules.js";

describe("constitution presets", () => {
  it("includes preset-specific guidance", () => {
    expect(presetGuidance.typescript.guidance.join(" ")).toContain("explicit types");
    expect(presetGuidance.electron.guidance.join(" ")).toContain("IPC");
    expect(presetGuidance.react.guidance.join(" ")).toContain("accessibility");
    expect(presetGuidance["node-api"].guidance.join(" ")).toContain("request inputs");
    expect(presetGuidance.go.guidance.join(" ")).toContain("package boundaries");
    expect(presetGuidance.java.guidance.join(" ")).toContain("public API");
    expect(presetGuidance.python.guidance.join(" ")).toContain("modules");
    expect(presetGuidance.rust.guidance.join(" ")).toContain("ownership");
  });

  it("includes budget-specific guidance", () => {
    expect(budgetGuidance.lean.join(" ")).toContain("smallest sufficient");
    expect(budgetGuidance.strict.join(" ")).toContain("stronger validation");
  });

  it("builds stable compact rule IDs", () => {
    const rules = buildConstitutionRules("typescript", "lean");

    expect(rules[0]).toEqual({
      id: "C001",
      text: "Keep functions small, specific, and readable.",
      category: "base"
    });
    expect(rules.map((rule) => rule.id)).toEqual(
      rules.map((_, index) => `C${String(index + 1).padStart(3, "0")}`)
    );
    expect(rules.some((rule) => rule.text.includes("TypeScript"))).toBe(true);
  });
});
