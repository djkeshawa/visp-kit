import { describe, expect, it } from "vitest";

import {
  assuranceCaseSchema,
  type AssuranceCase,
  type AssuranceCaseWithoutHash
} from "../../../src/artifacts/schemas/assurance-case.schema.js";
import {
  assuranceCaseHashDomain,
  createAssuranceCaseHash
} from "../../../src/assurance/assurance-case-hash.js";
import {
  assuranceCaseArtifactPath,
  assuranceCaseMarkdownPath
} from "../../../src/artifacts/artifact-paths.js";

const sha = (character: string) => `sha256:${character.repeat(64)}`;

function completeCase(): AssuranceCaseWithoutHash {
  return {
    version: "1.0",
    actionId: sha("0"),
    featureId: "F001",
    featureSlug: "assurance-cases",
    taskId: "T001",
    assuranceProfile: "critical",
    bindings: [
      {
        id: "baseline_evidence",
        role: "baseline_evidence",
        path: ".visp/features/001-assurance/assurance/T001/baseline-evidence.json",
        sha256: sha("a")
      },
      {
        id: "candidate_evidence",
        role: "candidate_evidence",
        path: ".visp/features/001-assurance/assurance/T001/candidate-evidence.json",
        sha256: sha("b")
      },
      {
        id: "context",
        role: "context",
        path: ".visp/features/001-assurance/context/T001.context.json",
        sha256: sha("c")
      },
      {
        id: "diff_snapshot",
        role: "diff_snapshot",
        path: ".visp/features/001-assurance/assurance/T001/diff.json",
        sha256: sha("d")
      },
      {
        id: "oracle_lock",
        role: "oracle_lock",
        path: ".visp/features/001-assurance/assurance/T001/oracle-lock.json",
        sha256: sha("e")
      },
      {
        id: "oracle_plan",
        role: "oracle_plan",
        path: ".visp/features/001-assurance/assurance/T001/oracle-plan.json",
        sha256: sha("f")
      },
      {
        id: "plan",
        role: "plan",
        path: ".visp/features/001-assurance/plan.json",
        sha256: sha("1")
      },
      {
        id: "policy",
        role: "policy",
        path: ".visp/policy.json",
        sha256: sha("2")
      },
      {
        id: "specification",
        role: "specification",
        path: ".visp/features/001-assurance/spec.json",
        sha256: sha("3")
      },
      {
        id: "task",
        role: "task",
        path: ".visp/features/001-assurance/task.json",
        sha256: sha("4")
      },
      {
        id: "task_graph",
        role: "task_graph",
        path: ".visp/features/001-assurance/task-graph.json",
        sha256: sha("5")
      }
    ],
    codeStates: {
      baseline: {
        status: "captured",
        revision: "0123456789abcdef0123456789abcdef01234567",
        sha256: sha("6")
      },
      candidate: {
        status: "captured",
        revision: "working-tree",
        sha256: sha("7")
      }
    },
    diff: {
      mode: "base_to_workspace",
      baseRevision: "0123456789abcdef0123456789abcdef01234567",
      targetRevision: "working-tree",
      snapshotSha256: sha("8")
    },
    changeUnits: [
      {
        id: "CU001",
        kind: "file",
        category: "rename",
        beforePath: "src/assurance/old-case.ts",
        afterPath: "src/assurance/case.ts",
        detailSha256: sha("9")
      },
      {
        id: "CU002",
        kind: "hunk",
        path: "src/assurance/case.ts",
        oldStart: 10,
        oldLines: 2,
        newStart: 10,
        newLines: 5,
        patchSha256: sha("a"),
        occurrence: 1
      }
    ],
    claims: [
      {
        id: "CL001",
        requirementId: "REQ001",
        acceptanceCriterionId: "AC001",
        priority: "must",
        assuranceProfile: "critical",
        statement: "The assurance case is deterministic.",
        disposition: "mapped",
        changeUnitIds: ["CU001", "CU002"],
        evidenceComparisonIds: ["EC001"],
        unresolvedItemIds: []
      }
    ],
    evidenceComparisons: [
      {
        id: "EC001",
        providerId: "unit-tests",
        claimIds: ["CL001"],
        baseline: {
          outcome: "failed",
          source: { bindingId: "baseline_evidence", evidenceIds: ["EV001"] },
          freshness: "fresh",
          independence: "pre_existing",
          uncertainty: { status: "none", reasons: [] }
        },
        candidate: {
          outcome: "passed",
          source: { bindingId: "candidate_evidence", evidenceIds: ["EV002"] },
          freshness: "fresh",
          independence: "independent_challenger",
          uncertainty: { status: "known", reasons: ["CI environment differs from production."] }
        },
        conclusion: "improved"
      }
    ],
    hotspots: [
      {
        id: "HS001",
        path: "src/assurance/case.ts",
        category: "generated_behavior",
        severity: "high",
        mandatory: true,
        reason: "Authoritative verdict logic changed.",
        changeUnitIds: ["CU001"],
        claimIds: ["CL001"]
      }
    ],
    assumptions: [
      {
        id: "AS001",
        statement: "The locked oracle plan remains authoritative.",
        sourceBindingIds: ["oracle_lock", "oracle_plan"]
      }
    ],
    unresolvedItems: [],
    overrides: [
      {
        id: "OV001",
        reference: "override-001",
        reason: "Approved test-environment exception.",
        claimIds: ["CL001"]
      }
    ],
    manualChecks: [
      {
        id: "MC001",
        description: "Inspect the canonical case.",
        status: "passed",
        claimIds: ["CL001"]
      }
    ],
    challengerFindings: [
      {
        id: "CF001",
        severity: "medium",
        status: "resolved",
        summary: "Confirm stable ordering.",
        claimIds: ["CL001"]
      }
    ],
    verdict: "passed",
    nextAction: {
      command: "visp review --task T001",
      reason: "The assurance case passed."
    }
  };
}

function signedCase(): AssuranceCase {
  const value = completeCase();
  return { ...value, caseHash: createAssuranceCaseHash(value) };
}

describe("assuranceCaseSchema", () => {
  it("accepts a complete strict assurance case and exposes stable artifact paths", () => {
    expect(assuranceCaseSchema.parse(signedCase())).toEqual(signedCase());
    expect(assuranceCaseArtifactPath("/repo", "001-assurance", "T001")).toBe(
      "/repo/.visp/features/001-assurance/assurance/T001/assurance-case.json"
    );
    expect(assuranceCaseMarkdownPath("/repo", "001-assurance", "T001")).toBe(
      "/repo/.visp/features/001-assurance/assurance/T001/assurance-case.md"
    );
  });

  it("rejects unknown keys and unsafe or non-normalized project paths", () => {
    expect(
      assuranceCaseSchema.safeParse({ ...signedCase(), generatedAt: "2026-07-25T00:00:00Z" })
        .success
    ).toBe(false);

    for (const unsafePath of [
      "/etc/passwd",
      "../secret",
      "src/../secret",
      "./src/file.ts",
      "src\\file.ts",
      "src//file.ts"
    ]) {
      const value = completeCase();
      value.bindings[0] = { ...value.bindings[0], path: unsafePath };
      expect(
        assuranceCaseSchema.safeParse({
          ...value,
          caseHash: createAssuranceCaseHash(value)
        }).success
      ).toBe(false);
    }

    const unsafeOptionalPath = completeCase();
    const fileUnit = unsafeOptionalPath.changeUnits[0];
    if (fileUnit.kind !== "file") throw new Error("Expected a file change unit.");
    unsafeOptionalPath.changeUnits[0] = {
      ...fileUnit,
      afterPath: "../case.ts"
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...unsafeOptionalPath,
        caseHash: createAssuranceCaseHash(unsafeOptionalPath)
      }).success
    ).toBe(false);

    const nestedUnknown = completeCase();
    nestedUnknown.evidenceComparisons[0].candidate = {
      ...nestedUnknown.evidenceComparisons[0].candidate,
      unexpected: true
    } as (typeof nestedUnknown.evidenceComparisons)[0]["candidate"];
    expect(
      assuranceCaseSchema.safeParse({
        ...nestedUnknown,
        caseHash: createAssuranceCaseHash(nestedUnknown)
      }).success
    ).toBe(false);
  });

  it("requires exactly one binding for every authoritative role", () => {
    const missing = completeCase();
    missing.bindings = missing.bindings.filter((binding) => binding.role !== "policy");
    expect(
      assuranceCaseSchema.safeParse({
        ...missing,
        caseHash: createAssuranceCaseHash(missing)
      }).success
    ).toBe(false);

    const duplicateRole = completeCase();
    duplicateRole.bindings[1] = {
      ...duplicateRole.bindings[1],
      role: "baseline_evidence"
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...duplicateRole,
        caseHash: createAssuranceCaseHash(duplicateRole)
      }).success
    ).toBe(false);
  });

  it("accepts a non-file hotspot located by claims alone", () => {
    const value = completeCase();
    value.hotspots[0] = {
      ...value.hotspots[0],
      category: "override_usage",
      path: null,
      changeUnitIds: [],
      claimIds: ["CL001"]
    };

    expect(
      assuranceCaseSchema.safeParse({
        ...value,
        caseHash: createAssuranceCaseHash(value)
      }).success
    ).toBe(true);
  });

  it("rejects duplicate, unsorted, or globally reused IDs", () => {
    const duplicate = completeCase();
    duplicate.changeUnits.push({ ...duplicate.changeUnits[0] });
    expect(
      assuranceCaseSchema.safeParse({
        ...duplicate,
        caseHash: createAssuranceCaseHash(duplicate)
      }).success
    ).toBe(false);

    const unsorted = completeCase();
    unsorted.bindings = [...unsorted.bindings].reverse();
    expect(
      assuranceCaseSchema.safeParse({
        ...unsorted,
        caseHash: createAssuranceCaseHash(unsorted)
      }).success
    ).toBe(false);

    const globallyReused = completeCase();
    globallyReused.hotspots[0] = { ...globallyReused.hotspots[0], id: "CL001" };
    expect(
      assuranceCaseSchema.safeParse({
        ...globallyReused,
        caseHash: createAssuranceCaseHash(globallyReused)
      }).success
    ).toBe(false);
  });

  it("rejects invalid references and constrained empty or uncertain records", () => {
    const badReference = completeCase();
    badReference.assumptions[0].sourceBindingIds = ["missing"];
    expect(
      assuranceCaseSchema.safeParse({
        ...badReference,
        caseHash: createAssuranceCaseHash(badReference)
      }).success
    ).toBe(false);

    const unknownEvidenceSource = completeCase();
    unknownEvidenceSource.evidenceComparisons[0].baseline.source.bindingId = "missing";
    expect(
      assuranceCaseSchema.safeParse({
        ...unknownEvidenceSource,
        caseHash: createAssuranceCaseHash(unknownEvidenceSource)
      }).success
    ).toBe(false);

    const wrongBaselineSourceRole = completeCase();
    wrongBaselineSourceRole.evidenceComparisons[0].baseline.source.bindingId = "policy";
    expect(
      assuranceCaseSchema.safeParse({
        ...wrongBaselineSourceRole,
        caseHash: createAssuranceCaseHash(wrongBaselineSourceRole)
      }).success
    ).toBe(false);

    const wrongCandidateSourceRole = completeCase();
    wrongCandidateSourceRole.evidenceComparisons[0].candidate.source.bindingId =
      "baseline_evidence";
    expect(
      assuranceCaseSchema.safeParse({
        ...wrongCandidateSourceRole,
        caseHash: createAssuranceCaseHash(wrongCandidateSourceRole)
      }).success
    ).toBe(false);

    const unlocatedHotspot = completeCase();
    unlocatedHotspot.hotspots[0] = {
      ...unlocatedHotspot.hotspots[0],
      path: null,
      changeUnitIds: [],
      claimIds: []
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...unlocatedHotspot,
        caseHash: createAssuranceCaseHash(unlocatedHotspot)
      }).success
    ).toBe(false);

    const duplicateReason = completeCase();
    duplicateReason.evidenceComparisons[0].candidate.uncertainty.reasons = [
      "Repeated.",
      "Repeated."
    ];
    expect(
      assuranceCaseSchema.safeParse({
        ...duplicateReason,
        caseHash: createAssuranceCaseHash(duplicateReason)
      }).success
    ).toBe(false);

    const invalidRename = completeCase();
    const rename = invalidRename.changeUnits[0];
    if (rename.kind !== "file") throw new Error("Expected a file change unit.");
    invalidRename.changeUnits[0] = {
      ...rename,
      afterPath: rename.beforePath
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...invalidRename,
        caseHash: createAssuranceCaseHash(invalidRename)
      }).success
    ).toBe(false);

    const invalidOccurrence = completeCase();
    const hunk = invalidOccurrence.changeUnits[1];
    if (hunk.kind !== "hunk") throw new Error("Expected a hunk change unit.");
    invalidOccurrence.changeUnits[1] = { ...hunk, occurrence: 0 };
    expect(
      assuranceCaseSchema.safeParse({
        ...invalidOccurrence,
        caseHash: createAssuranceCaseHash(invalidOccurrence)
      }).success
    ).toBe(false);

    const unexplainedUncertainty = completeCase();
    unexplainedUncertainty.evidenceComparisons[0].candidate = {
      ...unexplainedUncertainty.evidenceComparisons[0].candidate,
      uncertainty: { status: "unresolved", reasons: [] }
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...unexplainedUncertainty,
        caseHash: createAssuranceCaseHash(unexplainedUncertainty)
      }).success
    ).toBe(false);

    const unmappedMust = completeCase();
    unmappedMust.claims[0] = {
      ...unmappedMust.claims[0],
      disposition: "unmapped"
    };
    expect(
      assuranceCaseSchema.safeParse({
        ...unmappedMust,
        caseHash: createAssuranceCaseHash(unmappedMust)
      }).success
    ).toBe(false);
  });

  it("hashes canonical case content deterministically", () => {
    expect(assuranceCaseHashDomain).toBe("visp.assurance-case\0canonical-1.0\0");

    const value = completeCase();
    const reordered = Object.fromEntries(
      Object.entries(value).reverse()
    ) as AssuranceCaseWithoutHash;
    const hash = createAssuranceCaseHash(value);

    expect(createAssuranceCaseHash(reordered)).toBe(hash);
    expect(assuranceCaseSchema.safeParse({ ...value, caseHash: hash }).success).toBe(true);
  });

  it.each([
    ["identity", (value: AssuranceCaseWithoutHash) => ({ ...value, actionId: sha("f") })],
    [
      "bindings",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        bindings: value.bindings.map((binding, index) =>
          index === 0 ? { ...binding, sha256: sha("f") } : binding
        )
      })
    ],
    [
      "code state",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        codeStates: {
          ...value.codeStates,
          candidate: { status: "unavailable" as const, reason: "Candidate disappeared." }
        }
      })
    ],
    [
      "diff identity",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        diff: { ...value.diff, targetRevision: "candidate-2" }
      })
    ],
    [
      "change units",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        changeUnits: value.changeUnits.map((unit, index) =>
          index === 1 && unit.kind === "hunk" ? { ...unit, occurrence: 2 } : unit
        )
      })
    ],
    [
      "claims",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        claims: [{ ...value.claims[0], statement: "Changed claim." }]
      })
    ],
    [
      "evidence comparisons",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        evidenceComparisons: [{ ...value.evidenceComparisons[0], conclusion: "unchanged" as const }]
      })
    ],
    [
      "hotspots",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        hotspots: [{ ...value.hotspots[0], mandatory: false }]
      })
    ],
    [
      "assumptions",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        assumptions: [{ ...value.assumptions[0], statement: "Changed assumption." }]
      })
    ],
    [
      "overrides",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        overrides: [{ ...value.overrides[0], reason: "Changed override." }]
      })
    ],
    [
      "manual checks",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        manualChecks: [{ ...value.manualChecks[0], status: "failed" as const }]
      })
    ],
    [
      "challenger findings",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        challengerFindings: [{ ...value.challengerFindings[0], status: "accepted" as const }]
      })
    ],
    [
      "verdict",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        verdict: "inconclusive" as const
      })
    ],
    [
      "next action",
      (value: AssuranceCaseWithoutHash) => ({
        ...value,
        nextAction: { command: "visp verify T001", reason: "Resolve uncertainty." }
      })
    ]
  ])("rejects the old hash when %s drift", (_section, mutate) => {
    const value = completeCase();
    const hash = createAssuranceCaseHash(value);
    const drifted = mutate(value);
    expect(assuranceCaseSchema.safeParse({ ...drifted, caseHash: hash }).success).toBe(false);
  });
});
