import { describe, expect, it } from "vitest";

import { snippetRelevanceScore, taskKeywords } from "../../../src/context/context-relevance.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T001",
    title: "Add note pinning",
    description: "Implement pinning support in the notes module.",
    requirementIds: [],
    acceptanceCriterionIds: [],
    dependsOn: [],
    allowedFiles: [],
    expectedFiles: [],
    forbiddenFiles: [],
    validationCommands: [],
    status: "pending",
    parallelizable: false,
    riskLevel: "low",
    ...overrides
  };
}

describe("context relevance", () => {
  it("extracts keywords from task title and description", () => {
    const keywords = taskKeywords(task());

    expect(keywords).toContain("note");
    expect(keywords).toContain("pinning");
    expect(keywords).not.toContain("in");
    expect(keywords).not.toContain("task");
  });

  it("scores snippets whose path matches task keywords above unrelated snippets", () => {
    const keywords = taskKeywords(task());
    const related = {
      filePath: "src/notes/pinning.ts",
      content: "export function pinNote() {}",
      tokenEstimate: 50
    };
    const unrelated = {
      filePath: "src/billing/invoice.ts",
      content: "export function renderInvoice() {}",
      tokenEstimate: 50
    };

    expect(snippetRelevanceScore(related, keywords)).toBeGreaterThan(
      snippetRelevanceScore(unrelated, keywords)
    );
  });

  it("ranks a large weakly related snippet below a small strongly related one", () => {
    const keywords = taskKeywords(task());
    const smallRelated = {
      filePath: "src/notes.ts",
      content: "pinning helper",
      tokenEstimate: 20
    };
    const largeWeak = {
      filePath: "src/app.ts",
      content: `${"filler ".repeat(400)}note`,
      tokenEstimate: 700
    };

    expect(snippetRelevanceScore(smallRelated, keywords)).toBeGreaterThan(
      snippetRelevanceScore(largeWeak, keywords)
    );
  });
});
