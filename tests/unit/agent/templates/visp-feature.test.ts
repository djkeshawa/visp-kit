import { describe, expect, it } from "vitest";

import { renderVispFeatureTemplate } from "../../../../src/agent/templates/visp-feature.js";
import { renderVispTaskTemplate } from "../../../../src/agent/templates/visp-task.js";
import { renderVispFixTemplate } from "../../../../src/agent/templates/visp-fix.js";
import { renderVispReviewTemplate } from "../../../../src/agent/templates/visp-review.js";
import { renderVispPrTemplate } from "../../../../src/agent/templates/visp-pr.js";

describe("visp-feature template", () => {
  it("uses a next-driven loop with explicit branches", () => {
    const content = renderVispFeatureTemplate("strict");

    expect(content).toContain("## Rules digest");
    expect(content).toContain("The user prompt is raw intent only");
    expect(content).toContain("## Stage overview");
    expect(content).toContain(
      "feature -> clarify -> spec -> plan -> tasks -> context -> implement -> done (verify, review, reconcile) -> pr"
    );
    expect(content).toContain("Loop: run `visp next`");
    expect(content).toContain("visp clarify answer <question-id> --answer");
    expect(content).toContain("visp gate implement --task <task-id>");
    expect(content).toContain("Result blocked -> do NOT edit code");
    expect(content).toContain("visp done --task <task-id>");
    expect(content).toContain("## Stop conditions");
    expect(content).not.toContain("21. Run");
  });
});

describe("visp-task template", () => {
  it("uses numbered steps with blocked-gate branches", () => {
    const content = renderVispTaskTemplate("strict");

    expect(content).toContain("## Rules digest");
    expect(content).toContain("Result blocked -> run the command shown after `Next:`");
    expect(content).toContain("Result blocked -> do NOT edit code");
    expect(content).toContain(".visp/prompts/current-task.prompt.md");
    expect(content).toContain("It ends with `visp done --task <task-id>`");
  });
});

describe("visp-fix template", () => {
  it("repairs through visp done", () => {
    const content = renderVispFixTemplate("strict");

    expect(content).toContain("## Rules digest");
    expect(content).toContain("Fix only the reported issues.");
    expect(content).toContain("visp done --task <task-id>");
    expect(content).toContain("A step FAILED -> fix only the newly reported issues");
  });
});

describe("visp-review template", () => {
  it("keeps review read-only with a blocked branch", () => {
    const content = renderVispReviewTemplate("strict");

    expect(content).toContain("## Rules digest");
    expect(content).toContain("visp gate review --task <task-id>");
    expect(content).toContain("Result blocked -> stop");
    expect(content).toContain("Do not edit code unless the user explicitly asks for a fix.");
  });
});

describe("visp-pr template", () => {
  it("gates PR preparation", () => {
    const content = renderVispPrTemplate("strict");

    expect(content).toContain("## Rules digest");
    expect(content).toContain("visp gate pr");
    expect(content).toContain("Result blocked -> stop");
    expect(content).toContain("Do not call GitHub API.");
  });
});
