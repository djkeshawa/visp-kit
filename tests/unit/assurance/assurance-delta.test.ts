import { describe, expect, it } from "vitest";

import {
  computeAssuranceDelta,
  latestDecision,
  type AssuranceDeltaState
} from "../../../src/assurance/assurance-delta.js";

const hash = (seed: string) => seed.padEnd(64, "0");

const decision = (overrides: Record<string, unknown> = {}) =>
  ({
    decisionHash: hash("d1"),
    decidedAt: "2026-01-01T00:00:00.000Z",
    supersedesDecisionHash: null,
    codeState: {
      mode: "base_to_workspace",
      baseRevision: "base",
      targetRevision: "target",
      snapshotSha256: hash("s1"),
      stateSha256: hash("st1")
    },
    policy: { path: ".visp/policy.json", sha256: hash("p1") },
    freshnessInputs: [
      {
        label: "unit tests",
        path: ".visp/evidence/unit.json",
        status: "available",
        sha256: hash("e1")
      }
    ],
    ...overrides
  }) as never;

const state = (overrides: Partial<AssuranceDeltaState> = {}): AssuranceDeltaState =>
  ({
    codeState: {
      mode: "base_to_workspace",
      baseRevision: "base",
      targetRevision: "target",
      snapshotSha256: hash("s1"),
      stateSha256: hash("st1")
    },
    policy: { path: ".visp/policy.json", sha256: hash("p1") },
    freshnessInputs: [
      {
        label: "unit tests",
        path: ".visp/evidence/unit.json",
        status: "available",
        sha256: hash("e1")
      }
    ],
    ...overrides
  }) as never;

describe("assurance delta", () => {
  it("reports nothing moved when the state matches the decision", () => {
    const delta = computeAssuranceDelta({ trusted: decision(), current: state() });

    expect(delta.unchanged).toBe(true);
    expect(delta.decisionStale).toBe(false);
    expect(delta.changes).toEqual([]);
    // The reviewer should be able to stop at the first line.
    expect(delta.summary).toContain("still covers this state");
  });

  it("treats moved code as invalidating", () => {
    const delta = computeAssuranceDelta({
      trusted: decision(),
      current: state({
        codeState: {
          mode: "base_to_workspace",
          baseRevision: "base",
          targetRevision: "moved",
          snapshotSha256: hash("s1"),
          stateSha256: hash("st1")
        }
      } as never)
    });

    expect(delta.decisionStale).toBe(true);
    expect(delta.changes[0]!.kind).toBe("code");
  });

  it("separates an uncommitted edit from a new revision", () => {
    const delta = computeAssuranceDelta({
      trusted: decision(),
      current: state({
        codeState: {
          mode: "base_to_workspace",
          baseRevision: "base",
          targetRevision: "target",
          snapshotSha256: hash("s1"),
          stateSha256: hash("st2")
        }
      } as never)
    });

    // The revision did not move but the working state did. Collapsing these
    // would tell a reviewer "the code changed" without saying whether anyone
    // committed, which are different situations to chase down.
    expect(delta.changes).toHaveLength(1);
    expect(delta.changes[0]!.label).toContain("working state");
    expect(delta.decisionStale).toBe(true);
  });

  it("treats a changed policy as invalidating", () => {
    const delta = computeAssuranceDelta({
      trusted: decision(),
      current: state({ policy: { path: ".visp/policy.json", sha256: hash("p2") } } as never)
    });

    expect(delta.decisionStale).toBe(true);
    expect(delta.changes[0]!.kind).toBe("policy");
  });

  it("treats changed evidence as invalidating but newly available evidence as not", () => {
    const changed = computeAssuranceDelta({
      trusted: decision(),
      current: state({
        freshnessInputs: [
          {
            label: "unit tests",
            path: ".visp/evidence/unit.json",
            status: "available",
            sha256: hash("e2")
          }
        ]
      } as never)
    });

    expect(changed.decisionStale).toBe(true);

    const gained = computeAssuranceDelta({
      trusted: decision({
        freshnessInputs: [
          { label: "unit tests", path: ".visp/evidence/unit.json", status: "missing" }
        ]
      }),
      current: state()
    });

    // Evidence that was missing and is now present is new information, not a
    // contradiction. The decision was made without it and still stands; saying
    // otherwise would make gathering more evidence look like a regression.
    expect(gained.changes).toHaveLength(1);
    expect(gained.decisionStale).toBe(false);
    expect(gained.summary).toContain("none of which invalidate");
  });

  it("treats evidence that disappeared as invalidating", () => {
    const delta = computeAssuranceDelta({
      trusted: decision(),
      current: state({ freshnessInputs: [] } as never)
    });

    expect(delta.decisionStale).toBe(true);
    expect(delta.changes[0]!.label).toContain("no longer present");
  });

  it("reports evidence added after the decision without invalidating it", () => {
    const delta = computeAssuranceDelta({
      trusted: decision(),
      current: state({
        freshnessInputs: [
          {
            label: "unit tests",
            path: ".visp/evidence/unit.json",
            status: "available",
            sha256: hash("e1")
          },
          {
            label: "integration tests",
            path: ".visp/evidence/int.json",
            status: "available",
            sha256: hash("e3")
          }
        ]
      } as never)
    });

    expect(delta.decisionStale).toBe(false);
    expect(delta.changes[0]!.label).toContain("appeared after the decision");
  });

  it("follows supersession to the live decision", () => {
    const first = decision({ decisionHash: hash("d1"), decidedAt: "2026-01-01T00:00:00.000Z" });
    const second = decision({
      decisionHash: hash("d2"),
      decidedAt: "2026-02-01T00:00:00.000Z",
      supersedesDecisionHash: hash("d1")
    });

    // A superseded decision is one someone already replaced. Comparing against
    // it would report changes the reviewer has in fact already accepted.
    expect(latestDecision([first, second])?.decisionHash).toBe(hash("d2"));
    expect(latestDecision([second, first])?.decisionHash).toBe(hash("d2"));
    expect(latestDecision([])).toBeUndefined();
  });
});
