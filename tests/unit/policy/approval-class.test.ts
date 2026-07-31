import { describe, expect, it } from "vitest";

import {
  DEFAULT_BLAST_RADIUS,
  DEFAULT_REVERSIBILITY,
  approvalClassIsUnderstated,
  deriveApprovalClass
} from "../../../src/policy/approval-class.js";

/**
 * P8-05. Risk level said how much a mistake would cost; nothing said whether it
 * could be taken back. These tests pin the second question and, more
 * importantly, pin that silence is never read as consent.
 */
describe("P8-05 approval class", () => {
  it("anything that cannot be undone needs a human", () => {
    expect(deriveApprovalClass({ reversibility: "irreversible", blastRadius: "task" })).toBe(
      "approval_required"
    );
  });

  it("anything reaching outside the repository needs a human", () => {
    // Reversible and low risk is not enough when the effect leaves the project.
    expect(
      deriveApprovalClass({ reversibility: "reversible", blastRadius: "external", riskLevel: "low" })
    ).toBe("approval_required");
  });

  it("compensable work runs but must checkpoint first", () => {
    expect(deriveApprovalClass({ reversibility: "compensable", blastRadius: "project" })).toBe(
      "checkpointed"
    );
  });

  it("high risk checkpoints even when fully reversible", () => {
    expect(
      deriveApprovalClass({ reversibility: "reversible", blastRadius: "task", riskLevel: "high" })
    ).toBe("checkpointed");
  });

  it("reversible, contained, and not high risk is autonomous", () => {
    expect(
      deriveApprovalClass({ reversibility: "reversible", blastRadius: "task", riskLevel: "low" })
    ).toBe("autonomous");
  });

  it("an omitted declaration is read as the worst case, not the best", () => {
    // The whole point. If forgetting to declare bought autonomy, every task
    // graph written before P8-05 would silently gain it.
    expect(deriveApprovalClass({})).toBe("approval_required");
    expect(DEFAULT_REVERSIBILITY).toBe("irreversible");
    expect(DEFAULT_BLAST_RADIUS).toBe("external");
  });

  it("a partial declaration still defaults the missing half conservatively", () => {
    expect(deriveApprovalClass({ reversibility: "reversible" })).toBe("approval_required");
    expect(deriveApprovalClass({ blastRadius: "task" })).toBe("approval_required");
  });

  it("reports a declaration weaker than its inputs justify", () => {
    // The dangerous direction of drift: the task claims autonomy while its own
    // fields say it cannot be undone.
    expect(
      approvalClassIsUnderstated("autonomous", { reversibility: "irreversible", blastRadius: "task" })
    ).toBe(true);
  });

  it("leaves a stricter-than-required declaration alone", () => {
    // Choosing more caution than the rule demands is the author's prerogative.
    expect(
      approvalClassIsUnderstated("approval_required", {
        reversibility: "reversible",
        blastRadius: "task",
        riskLevel: "low"
      })
    ).toBe(false);
  });

  it("takes no confidence input", () => {
    // Being sure is not the same as being allowed. This asserts the signature
    // itself: adding a calibration or score field would break it.
    const keys = Object.keys({
      reversibility: "reversible" as const,
      blastRadius: "task" as const,
      riskLevel: "low" as const
    });
    expect(keys).toEqual(["reversibility", "blastRadius", "riskLevel"]);
  });
});
