import { describe, expect, it } from "vitest";

import { renderClarifyPrompt } from "../../../src/prompts/render-clarify-prompt.js";
import { renderPlanPrompt } from "../../../src/prompts/render-plan-prompt.js";
import { renderSpecPrompt } from "../../../src/prompts/render-spec-prompt.js";
import { renderTasksPrompt } from "../../../src/prompts/render-tasks-prompt.js";
import { type ActiveFeature } from "../../../src/workflows/shared/active-feature.js";

const feature: ActiveFeature = {
  id: "001",
  slug: "add-note-pinning",
  key: "001-add-note-pinning",
  path: "/project/.visp/features/001-add-note-pinning",
  relativePath: ".visp/features/001-add-note-pinning",
  intent: {
    id: "001",
    slug: "add-note-pinning",
    title: "Add note pinning",
    rawUserRequest: "Add note pinning",
    status: "draft",
    budgetMode: "lean",
    riskLevel: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};

describe("phase 7 prompt renderers", () => {
  it("render compact path-based prompts", () => {
    const prompts = [
      renderClarifyPrompt(feature),
      renderSpecPrompt(feature),
      renderPlanPrompt(feature),
      renderTasksPrompt(feature)
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain(".visp/features/001-add-note-pinning");
      expect(prompt).toContain("After editing, run:");
      expect(prompt).not.toContain("Add note pinning\n\nAdd note pinning");
    }
  });
});
