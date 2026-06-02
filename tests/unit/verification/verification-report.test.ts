import { describe, expect, it } from "vitest";

import {
  createVerificationSummary,
  renderVerificationMarkdown
} from "../../../src/verification/verification-report.js";
import { type VerificationReport } from "../../../src/artifacts/schemas/verification.schema.js";
import { validVerificationReport } from "../artifacts/fixtures.js";

function withoutSummary(report: VerificationReport): Omit<VerificationReport, "summary"> {
  const { summary: _summary, ...rest } = report;

  return rest;
}

describe("verification report", () => {
  it("summarizes command failures", () => {
    const summary = createVerificationSummary({
      ...withoutSummary(validVerificationReport),
      commandValidation: {
        ...validVerificationReport.commandValidation,
        commands: [
          {
            ...validVerificationReport.commandValidation.commands[0]!,
            success: false,
            exitCode: 1,
            stderr: "failed"
          }
        ]
      }
    });

    expect(summary.passed).toBe(false);
    expect(summary.commandsFailed).toBe(1);
  });

  it("renders command failures and scope violations", () => {
    const markdown = renderVerificationMarkdown({
      ...validVerificationReport,
      success: false,
      scopeValidation: {
        ...validVerificationReport.scopeValidation,
        status: "failed",
        outOfScopeFiles: ["src/other.ts"],
        errors: ["Out-of-scope file changed: src/other.ts."]
      },
      errors: ["Command failed: pnpm test"]
    });

    expect(markdown).toContain("# Verification Report");
    expect(markdown).toContain("Command failed: pnpm test");
    expect(markdown).toContain("src/other.ts");
  });
});
