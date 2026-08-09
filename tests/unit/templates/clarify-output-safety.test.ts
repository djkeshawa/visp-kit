import { describe, expect, it } from "vitest";

import { createClarificationArtifact } from "../../../src/templates/phase7-templates.js";

/**
 * Phase 18, measured on a real 8,800-line codebase: two agents were given the
 * same vague failure-handling request. Both built a new error-reporting
 * surface, and BOTH printed the raw error string to the terminal — in a
 * codebase whose own `database/mod.rs` routes every printed error through
 * `mask_error_message()` because Mongo errors carry connection strings with
 * passwords.
 *
 * The ceremony did not prevent it, and the reason was structural rather than
 * accidental: clarify asks what information to SHOW and never what must not be
 * shown. A seeded, pre-written question costs one answer instead of one
 * invention, which is the cheapest possible way to force the consideration on
 * a weak model that abandons ceremony under load.
 */
describe("clarify asks what must never be shown", () => {
  const template = createClarificationArtifact({
    feature: { id: "001", slug: "add-due-dates" },
    now: "2026-08-09T00:00:00.000Z"
  } as Parameters<typeof createClarificationArtifact>[0]);

  it("seeds an output-safety question already decided, not another gate", () => {
    // Ten rounds of weak-model evaluation: every improvement that worked
    // REMOVED a required step; every added step got abandoned under load.
    // So this arrives answered with the safe default — the decision is
    // recorded and visible, and costs the author nothing to keep.
    const safety = template.questions.find((question) => question.category === "security");

    expect(safety).toBeDefined();
    expect(safety?.question.toLowerCase()).toContain("never appear");
    expect(safety?.status).toBe("accepted_default");
    expect(safety?.blocking).toBe(false);
    expect(safety?.answer).toBe(safety?.recommendedDefault);
    expect(safety?.answer.length).toBeGreaterThan(0);
  });

  it("arrives pre-written, not as another TBD to invent", () => {
    const safety = template.questions.find((question) => question.category === "security");

    // The behaviour question is deliberately TBD — only the author knows it.
    // This one is universal, so the template supplies it and the recommended
    // default, leaving the author a decision rather than a blank page.
    expect(safety?.question).not.toContain("TBD");
    expect(safety?.recommendedDefault).not.toContain("TBD");
    expect(safety?.reason).not.toContain("TBD");
  });

  it("points the author at the project's own redaction helpers", () => {
    const safety = template.questions.find((question) => question.category === "security");

    expect(safety?.recommendedDefault.toLowerCase()).toMatch(/redact|mask/u);
  });

  it("keeps the open behaviour question alongside it", () => {
    expect(template.questions.some((question) => question.category === "behavior")).toBe(true);
    expect(template.questions.length).toBeGreaterThanOrEqual(2);
  });
});
