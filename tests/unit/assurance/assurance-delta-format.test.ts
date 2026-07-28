import { describe, expect, it } from "vitest";

import { formatAssuranceDelta } from "../../../src/assurance/assurance-delta-format.js";
import { type AssuranceDelta } from "../../../src/assurance/assurance-delta.js";

const base = {
  trustedDecisionHash: `sha256:${"a".repeat(64)}`,
  trustedDecidedAt: "2026-01-01T00:00:00.000Z"
};

describe("assurance delta formatting", () => {
  it("tells an unchanged reviewer there is nothing to re-read", () => {
    const output = formatAssuranceDelta({
      ...base,
      changes: [],
      unchanged: true,
      decisionStale: false,
      summary: "Nothing has moved."
    } as AssuranceDelta);

    expect(output).toContain("nothing moved");
    expect(output).toContain("Nothing to re-read.");
    // No change list should appear, or the reader will start scanning one.
    expect(output).not.toContain("no longer applies");
  });

  it("separates invalidating changes from harmless ones", () => {
    const output = formatAssuranceDelta({
      ...base,
      changes: [
        {
          kind: "code",
          label: "the code under review",
          trusted: "a".repeat(40),
          current: "b".repeat(40),
          invalidatesDecision: true
        },
        {
          kind: "evidence_availability",
          label: "integration tests appeared after the decision",
          trusted: "absent",
          current: "available",
          invalidatesDecision: false
        }
      ],
      unchanged: false,
      decisionStale: true,
      summary: "1 of 2 changes invalidate the earlier review."
    } as AssuranceDelta);

    const invalidatingAt = output.indexOf("no longer applies");
    const informationalAt = output.indexOf("do not invalidate it");

    expect(invalidatingAt).toBeGreaterThan(-1);
    expect(informationalAt).toBeGreaterThan(-1);
    // Consequential first. Folding these together would make gaining evidence
    // read as a problem, which is the wrong incentive.
    expect(invalidatingAt).toBeLessThan(informationalAt);
    expect(output).toContain("Re-review, then run visp assurance accept or reject.");
  });

  it("does not demand re-review when nothing invalidating moved", () => {
    const output = formatAssuranceDelta({
      ...base,
      changes: [
        {
          kind: "evidence_availability",
          label: "unit tests appeared after the decision",
          trusted: "absent",
          current: "available",
          invalidatesDecision: false
        }
      ],
      unchanged: false,
      decisionStale: false,
      summary: "1 change, none of which invalidate the earlier review."
    } as AssuranceDelta);

    expect(output).toContain("still stands");
    expect(output).toContain("No action required");
    expect(output).not.toContain("Re-review, then run");
  });

  it("abbreviates hashes but leaves readable values alone", () => {
    const output = formatAssuranceDelta({
      ...base,
      changes: [
        {
          kind: "code",
          label: "the reviewed diff",
          trusted: `sha256:${"c".repeat(64)}`,
          current: "absent",
          invalidatesDecision: true
        }
      ],
      unchanged: false,
      decisionStale: true,
      summary: "1 change."
    } as AssuranceDelta);

    // A full 64-character hash on screen is noise; the leading characters are
    // what anyone actually compares.
    expect(output).toContain(`${"c".repeat(12)}…`);
    expect(output).not.toContain("c".repeat(64));
    expect(output).toContain("absent");
  });
});
