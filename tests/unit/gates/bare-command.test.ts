import { describe, expect, it } from "vitest";

import { bareCommandFromRecommendation } from "../../../src/gates/stage-checks.js";

describe("bareCommandFromRecommendation", () => {
  it("strips the Run prefix and trailing period from a visp command sentence", () => {
    expect(bareCommandFromRecommendation("Run visp tasks.")).toBe("visp tasks");
  });

  it("preserves flags in the extracted command", () => {
    expect(
      bareCommandFromRecommendation("Run visp reconcile --task T001 --update-traceability.")
    ).toBe("visp reconcile --task T001 --update-traceability");
  });

  it("returns undefined for non-runnable prose", () => {
    expect(bareCommandFromRecommendation("Continue.")).toBeUndefined();
    expect(
      bareCommandFromRecommendation(
        "Read .visp/prompts/current-task.prompt.md and implement only the selected task."
      )
    ).toBeUndefined();
  });

  it("tolerates a missing trailing period", () => {
    expect(bareCommandFromRecommendation("Run visp scan")).toBe("visp scan");
  });
});
