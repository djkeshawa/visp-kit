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

/** The bullet list under a prompt heading, up to the next blank line. */
function section(prompt: string, heading: string): string {
  const start = prompt.indexOf(`${heading}\n`);

  if (start === -1) return "";

  const body = prompt.slice(start + heading.length + 1);
  const end = body.indexOf("\n\n");

  return end === -1 ? body : body.slice(0, end);
}

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

  it("renders spec prompt schema guardrails for common enum mistakes", () => {
    const prompt = renderSpecPrompt(feature);

    expect(prompt).toContain("- validationMethod: unit | integration | e2e | manual | static");
    expect(prompt).toContain("- source: user | clarification | derived");
    expect(prompt).toContain("- priority: must | should | could");
    expect(prompt).toContain("Example requirement entry in spec.json:");
    expect(prompt).toContain('"requirementId": "REQ001"');
  });

  it("every prompt embeds a JSON example and the edit-in-place instruction", () => {
    const prompts = [
      renderClarifyPrompt(feature),
      renderSpecPrompt(feature),
      renderPlanPrompt(feature),
      renderTasksPrompt(feature)
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("```json");
      expect(prompt).toContain("Edit the seeded JSON files in place");
      expect(prompt).toContain("Field values (exact, no other values are valid):");
    }

    expect(renderTasksPrompt(feature)).toContain(
      "- status: pending | ready | in_progress | blocked | done | verified"
    );
    expect(renderTasksPrompt(feature)).toContain(
      "- taskClass: localized_bug | bounded_feature | cross_file_change | regression_test | refactor | migration | security | documentation"
    );
    expect(renderTasksPrompt(feature)).toContain(
      "- riskFactors[].code: authentication | authorization | cryptography | public_api | schema | dependency | concurrency | permissions | deployment | data_migration"
    );
    expect(renderPlanPrompt(feature)).toContain("Example decision entry in plan.json:");
    expect(renderClarifyPrompt(feature)).toContain(
      "Example question entry in clarifications.json:"
    );
  });

  it("lists generated markdown under Generated, never under Update", () => {
    const cases = [
      {
        prompt: renderClarifyPrompt(feature),
        command: "visp-kit clarify --validate",
        generated: ["clarifications.md"],
        updated: ["clarifications.json"]
      },
      {
        prompt: renderSpecPrompt(feature),
        command: "visp-kit spec --validate",
        generated: ["spec.md", "traceability.md"],
        updated: ["spec.json", "traceability.json"]
      },
      {
        prompt: renderPlanPrompt(feature),
        command: "visp-kit plan --validate",
        generated: ["plan.md"],
        updated: ["plan.json"]
      },
      {
        prompt: renderTasksPrompt(feature),
        command: "visp-kit tasks --validate",
        // traceability.json stays under Update: — `visp-kit tasks --validate` reads and
        // validates it but never regenerates it, and missing task coverage is a hard
        // error (validate-task-graph.ts). Listing it as generated would forbid the one
        // edit that clears the failure.
        generated: ["tasks.md", "traceability.md"],
        updated: ["task-graph.json", "traceability.json"]
      }
    ];

    for (const testCase of cases) {
      const updateBlock = section(testCase.prompt, "Update:");
      const generatedBlock = section(testCase.prompt, "Generated (do not edit):");

      expect(generatedBlock).not.toBe("");
      expect(updateBlock).not.toMatch(/\.md$/mu);

      for (const file of testCase.generated) {
        expect(generatedBlock).toContain(`${feature.relativePath}/${file}`);
        expect(updateBlock).not.toContain(`${feature.relativePath}/${file}`);
      }

      for (const file of testCase.updated) {
        expect(updateBlock).toContain(`${feature.relativePath}/${file}`);
      }

      expect(testCase.prompt).toContain(
        `The files under Generated are rendered from the JSON by \`${testCase.command}\`; edits to them are discarded.`
      );
    }
  });

  it("keeps the Read lists pointing at the generated markdown", () => {
    expect(section(renderPlanPrompt(feature), "Read:")).toContain(
      `${feature.relativePath}/spec.md`
    );

    const tasksRead = section(renderTasksPrompt(feature), "Read:");
    expect(tasksRead).toContain(`${feature.relativePath}/spec.md`);
    expect(tasksRead).toContain(`${feature.relativePath}/plan.md`);
    expect(tasksRead).toContain(`${feature.relativePath}/traceability.md`);
  });
});
