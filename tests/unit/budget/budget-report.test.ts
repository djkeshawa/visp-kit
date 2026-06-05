import { describe, expect, it } from "vitest";

import { renderBudgetReport } from "../../../src/budget/budget-report.js";
import { timestamp } from "../artifacts/fixtures.js";

describe("budget report", () => {
  it("renders over-budget recommendations", () => {
    const report = renderBudgetReport({
      generatedAt: timestamp,
      feature: {
        id: "001",
        slug: "note-pinning",
        title: "Add note pinning"
      },
      budgetMode: "lean",
      tasks: [
        {
          taskId: "T001",
          estimatedInputTokens: 9000,
          expectedOutputTokens: 1500,
          estimatedTotalTokens: 10500,
          actualInputTokens: 8200,
          actualOutputTokens: 1200,
          actualTotalTokens: 9400,
          actualUsageSource: "agent-reported",
          actualUsageModel: "codex",
          actualUsageRecordedAt: timestamp,
          maxInputTokens: 8000,
          overBudget: true,
          recommendation: "Split the task."
        }
      ],
      warnings: ["Scan cache is incomplete."]
    });

    expect(report).toContain("# Visp Budget Report");
    expect(report).toContain("T001");
    expect(report).toContain("Actual Usage");
    expect(report).toContain("9400");
    expect(report).toContain("Split the task.");
    expect(report).toContain("Scan cache is incomplete.");
  });
});
