import { describe, expect, it } from "vitest";

import { type VerificationCommandResult } from "../../../src/artifacts/schemas/verification.schema.js";
import { evaluateCodeEvidence } from "../../../src/verification/code-evidence.js";
import { classifyValidationCommand } from "../../../src/verification/command-classifier.js";
import { timestamp } from "../artifacts/fixtures.js";

function commandResult(
  overrides: Partial<VerificationCommandResult> = {}
): VerificationCommandResult {
  return {
    command: "pnpm test",
    cwd: "/tmp/project",
    exitCode: 0,
    success: true,
    durationMs: 10,
    startedAt: timestamp,
    endedAt: timestamp,
    stdout: "",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    skipped: false,
    skipReason: null,
    timedOut: false,
    ...overrides
  };
}

function input(overrides: Partial<Parameters<typeof evaluateCodeEvidence>[0]> = {}) {
  return {
    commandChannelEnabled: true,
    commandResults: [] as readonly VerificationCommandResult[],
    rejectedCommands: [],
    changedFiles: ["src/game.js"],
    projectHasCommands: true,
    dryRun: false,
    ...overrides
  };
}

describe("evaluateCodeEvidence", () => {
  it("refuses, rather than passes, when nothing executed", () => {
    const evaluation = evaluateCodeEvidence(input());

    expect(evaluation.section.evidence).toBe("refused");
    expect(evaluation.section.status).toBe("failed");
    expect(evaluation.errors).toHaveLength(1);
    expect(evaluation.errors[0]).toContain("1 changed file(s) were not examined");
    expect(evaluation.nextCommand).not.toBeNull();
  });

  it("names the command that unblocks the refusal", () => {
    expect(evaluateCodeEvidence(input({ projectHasCommands: false })).nextCommand).toBe(
      "visp-kit scan"
    );
    expect(
      evaluateCodeEvidence(
        input({
          rejectedCommands: [classifyValidationCommand("Open the page and look at it")]
        })
      ).nextCommand
    ).toBe("visp-kit tasks --validate");
  });

  // Kit writing its own status file is not the project producing code. A run
  // whose only diff is bookkeeping should not be described as "3 changed
  // files went unexamined".
  it("does not count Kit's own artifacts as produced code", () => {
    const evaluation = evaluateCodeEvidence(
      input({
        changedFiles: [".visp/status.json", ".visp/features/001-x/verification.md"],
        commandResults: [commandResult()]
      })
    );

    expect(evaluation.section.changedCodeFiles).toEqual([]);
  });

  it("says a skipped-command run is delegated, not evidence", () => {
    const evaluation = evaluateCodeEvidence(input({ commandChannelEnabled: false }));

    expect(evaluation.section.evidence).toBe("delegated");
    expect(evaluation.errors).toEqual([]);
    expect(evaluation.section.warnings.join(" ")).toContain("carries no evidence about the code");
  });

  it("still fails a delegated run that declared an unrunnable check", () => {
    const evaluation = evaluateCodeEvidence(
      input({
        commandChannelEnabled: false,
        rejectedCommands: [classifyValidationCommand("Manually verify the wrap behaviour")]
      })
    );

    expect(evaluation.section.status).toBe("failed");
    expect(evaluation.errors.join(" ")).toContain("never performed");
  });

  it("passes only when something executed and passed", () => {
    const evaluation = evaluateCodeEvidence(input({ commandResults: [commandResult()] }));

    expect(evaluation.section.evidence).toBe("executed");
    expect(evaluation.section.status).toBe("passed");
    expect(evaluation.errors).toEqual([]);
  });

  it("treats a dry run as a plan, not a verdict", () => {
    const evaluation = evaluateCodeEvidence(input({ dryRun: true }));

    expect(evaluation.errors).toEqual([]);
    expect(evaluation.section.evidence).toBe("delegated");
  });
});
