import { describe, expect, it } from "vitest";

import { type GateResult } from "../../../src/artifacts/schemas/gate.schema.js";
import { formatGateResult, renderGateReport } from "../../../src/gates/gate-report.js";

const result: GateResult = {
  success: false,
  targetPath: "/repo",
  stage: "implement",
  strictnessMode: "strict",
  allowed: false,
  dryRun: false,
  feature: {
    id: "001",
    slug: "add-note-pinning"
  },
  taskId: "T001",
  passedRules: ["VSP008"],
  failedRules: [
    {
      ruleId: "VSP007",
      severity: "error",
      message: "Implementation requires a context pack.",
      recommendation: "Run visp context --next.",
      evidence: "Task context JSON was not found."
    }
  ],
  warnings: [],
  blockedCommands: [
    {
      command: "implementation",
      reason: "Implementation requires a context pack.",
      ruleId: "VSP007"
    }
  ],
  overriddenRules: [],
  appliedOverrides: [],
  nextAllowedCommand: "Run visp context --next.",
  reportPath: ".visp/reports/gate-report.md",
  evaluatedAt: "2026-01-01T00:00:00.000Z"
};

describe("gate report renderer", () => {
  it("includes failed rules and next command", () => {
    const markdown = renderGateReport(result);

    expect(markdown).toContain("# Gate Report");
    expect(markdown).toContain("VSP007");
    expect(markdown).toContain("Run visp context --next.");
  });

  it("formats compact terminal output", () => {
    const output = formatGateResult(result);

    expect(output).toContain("Visp gate blocked");
    expect(output).toContain("Stage: implement");
    expect(output).toContain("VSP007");
  });
});
