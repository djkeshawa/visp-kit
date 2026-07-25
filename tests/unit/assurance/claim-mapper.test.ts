import { describe, expect, it } from "vitest";

import { mapAssuranceClaims } from "../../../src/assurance/claim-mapper.js";
import { type AssuranceCaseWithoutHash } from "../../../src/artifacts/schemas/assurance-case.schema.js";
import { type OraclePlan } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import { type SpecArtifact } from "../../../src/artifacts/schemas/spec.schema.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../../../src/artifacts/schemas/traceability.schema.js";

const sha = `sha256:${"a".repeat(64)}` as const;
const now = "2026-07-25T00:00:00.000Z";

const task: Task = {
  id: "T001",
  title: "Map claims",
  description: "Map changed units to claims.",
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001", "AC002", "AC003"],
  dependsOn: [],
  allowedFiles: ["src/a.ts", "src/old.ts", "src/new.ts"],
  expectedFiles: ["tests/a.test.ts"],
  forbiddenFiles: [],
  validationCommands: ["pnpm test"],
  status: "in_progress",
  parallelizable: false,
  riskLevel: "medium",
  taskClass: "bounded_feature",
  riskFactors: []
};

const spec: SpecArtifact = {
  featureId: "F001",
  featureSlug: "claim-mapping",
  title: "Claim mapping",
  status: "ready",
  userStories: [],
  requirements: [
    {
      id: "REQ001",
      featureId: "F001",
      title: "Mapped behavior",
      description: "Behavior must be mapped.",
      source: "user",
      priority: "must",
      acceptanceCriteria: [
        {
          id: "AC001",
          requirementId: "REQ001",
          description: "First behavior.",
          testable: true,
          validationMethod: "unit"
        },
        {
          id: "AC002",
          requirementId: "REQ001",
          description: "Second behavior.",
          testable: true,
          validationMethod: "unit"
        },
        {
          id: "AC003",
          requirementId: "REQ001",
          description: "Renamed behavior.",
          testable: true,
          validationMethod: "static"
        }
      ],
      assumptions: [],
      outOfScope: []
    }
  ],
  acceptanceCriteria: [],
  businessRules: ["Stored claim IDs remain stable."],
  nonFunctionalRequirements: {
    performance: [],
    security: ["Unsafe paths never become claims."],
    accessibility: [],
    reliability: [],
    maintainability: []
  },
  edgeCases: [],
  assumptions: [],
  outOfScope: [],
  createdAt: now,
  updatedAt: now
};

const traceability: TraceabilityMatrix = {
  featureId: "F001",
  featureSlug: "claim-mapping",
  updatedAt: now,
  entries: [
    {
      requirementId: "REQ001",
      acceptanceCriterionIds: ["AC001", "AC002"],
      taskIds: ["T001"],
      filePaths: ["src/a.ts"],
      testPaths: ["tests/a.test.ts"],
      status: "covered"
    },
    {
      requirementId: "REQ001",
      acceptanceCriterionIds: ["AC003"],
      taskIds: ["T001"],
      filePaths: ["src/old.ts"],
      testPaths: [],
      status: "covered"
    }
  ]
};

const oraclePlan: OraclePlan = {
  version: "1.0",
  featureId: "F001",
  featureSlug: "claim-mapping",
  taskId: "T001",
  assuranceProfile: "behavioral",
  criticalReviewApproval: { required: false, status: "not_required" },
  oracles: [
    {
      id: "O001",
      requirementId: "REQ001",
      acceptanceCriterionId: "AC001",
      description: "Run unit test.",
      priority: "must",
      validationMethod: "unit",
      baseline: { expected: "failed" },
      candidate: { expected: "passed" }
    }
  ],
  validationCommands: ["pnpm test"],
  testStrengthEvidence: [],
  bindings: {
    policy: { path: ".visp/policy.json", sha256: sha },
    specification: { path: ".visp/features/f/spec.json", sha256: sha },
    plan: { path: ".visp/features/f/plan.json", sha256: sha },
    taskGraph: { path: ".visp/features/f/task-graph.json", sha256: sha },
    context: { path: ".visp/features/f/context/T001.context.json", sha256: sha },
    task: { id: "T001", sha256: sha }
  },
  baseCommit: { status: "captured", commit: "a".repeat(40) },
  requiredProviders: [{ id: "vitest", version: "1" }],
  generatedAt: now
};

const changeUnits: AssuranceCaseWithoutHash["changeUnits"] = [
  {
    id: "CU-A",
    kind: "hunk",
    path: "src/a.ts",
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 2,
    patchSha256: sha,
    occurrence: 1
  },
  {
    id: "CU-R",
    kind: "file",
    category: "rename",
    beforePath: "src/old.ts",
    afterPath: "src/new.ts",
    detailSha256: sha
  },
  {
    id: "CU-U",
    kind: "hunk",
    path: "docs/unmapped.md",
    oldStart: 1,
    oldLines: 0,
    newStart: 1,
    newLines: 1,
    patchSha256: sha,
    occurrence: 1
  }
];

function mapping(
  result: ReturnType<typeof mapAssuranceClaims>
): Extract<typeof result, { ok: true }>["value"] {
  expect(result.ok).toBe(true);
  if (!result.ok) throw result.error;
  return result.value;
}

describe("mapAssuranceClaims", () => {
  it("maps all matching hunks, preserves rename paths, and reports unmapped units", () => {
    const result = mapping(
      mapAssuranceClaims({
        task,
        spec,
        traceability,
        oraclePlan,
        changeUnits
      })
    );

    expect(result.claims.find((claim) => claim.id === "CL-AC-AC001")).toMatchObject({
      disposition: "mapped",
      changeUnitIds: ["CU-A"],
      evidenceComparisonIds: ["EC-O001"]
    });
    expect(result.claims.find((claim) => claim.id === "CL-AC-AC002")).toMatchObject({
      disposition: "mapped",
      changeUnitIds: ["CU-A"]
    });
    expect(result.claims.find((claim) => claim.id === "CL-AC-AC003")).toMatchObject({
      disposition: "mapped",
      changeUnitIds: ["CU-R"]
    });
    expect(result.unmappedChangeUnitIds).toEqual(["CU-U"]);
  });

  it("maps claims to evidence and leaves unbound must invariants unresolved", () => {
    const result = mapping(
      mapAssuranceClaims({
        task: { ...task, acceptanceCriterionIds: ["AC001"] },
        spec,
        traceability: { ...traceability, entries: [] },
        oraclePlan,
        changeUnits: []
      })
    );

    const acceptance = result.claims.find((claim) => claim.id === "CL-AC-AC001");
    expect(acceptance).toMatchObject({
      source: {
        kind: "acceptance_criterion",
        requirementId: "REQ001",
        acceptanceCriterionId: "AC001"
      },
      disposition: "mapped"
    });
    expect(acceptance?.unresolvedItemIds).toEqual([]);
    expect(
      result.claims
        .flatMap((claim) => (claim.source.kind === "invariant" ? [claim.source.origin] : []))
        .sort()
    ).toEqual(["business_rule", "non_functional"]);
    expect(
      result.claims
        .filter((claim) => claim.source.kind === "invariant")
        .every(
          (claim) =>
            claim.source.kind === "invariant" &&
            /^INV-[a-f0-9]{64}-1$/u.test(claim.source.invariantId)
        )
    ).toBe(true);
    expect(
      result.claims
        .filter((claim) => claim.source.kind === "invariant")
        .every((claim) => claim.disposition === "unresolved")
    ).toBe(true);
  });

  it("does not manufacture invariant mappings or treat a file path as a directory prefix", () => {
    const nestedUnit = {
      ...changeUnits[0],
      id: "CU-NESTED",
      path: "src/a.ts/generated.ts"
    } as AssuranceCaseWithoutHash["changeUnits"][number];
    const result = mapping(
      mapAssuranceClaims({
        task: { ...task, acceptanceCriterionIds: ["AC001"] },
        spec,
        traceability,
        oraclePlan,
        changeUnits: [changeUnits[0], nestedUnit]
      })
    );

    expect(
      result.claims
        .filter((claim) => claim.source.kind === "invariant")
        .every(
          (claim) =>
            claim.disposition === "unresolved" &&
            claim.changeUnitIds.length === 0 &&
            claim.unresolvedItemIds.length === 1
        )
    ).toBe(true);
    expect(result.claims.find((claim) => claim.id === "CL-AC-AC001")?.changeUnitIds).toEqual([
      "CU-A"
    ]);
    expect(result.unmappedChangeUnitIds).toContain("CU-NESTED");
  });

  it("does not map a whitespace-prefixed Git path to its trimmed traceability path", () => {
    const whitespaceUnit = {
      ...changeUnits[0],
      id: "CU-WHITESPACE",
      path: " src/a.ts"
    } as AssuranceCaseWithoutHash["changeUnits"][number];
    const result = mapping(
      mapAssuranceClaims({
        task: { ...task, acceptanceCriterionIds: ["AC001"] },
        spec,
        traceability,
        oraclePlan,
        changeUnits: [whitespaceUnit]
      })
    );

    expect(result.claims.find((claim) => claim.id === "CL-AC-AC001")?.changeUnitIds).toEqual([]);
    expect(result.unmappedChangeUnitIds).toEqual(["CU-WHITESPACE"]);
  });

  it("keeps content-derived invariant IDs stable when an unrelated invariant is inserted", () => {
    const first = mapping(
      mapAssuranceClaims({
        task: { ...task, acceptanceCriterionIds: [] },
        spec,
        traceability,
        oraclePlan,
        changeUnits: []
      })
    );
    const second = mapping(
      mapAssuranceClaims({
        task: { ...task, acceptanceCriterionIds: [] },
        spec: { ...spec, businessRules: ["A new unrelated rule.", ...spec.businessRules] },
        traceability,
        oraclePlan,
        changeUnits: []
      })
    );
    const originalId = first.claims.find(
      (claim) => claim.statement === "Stored claim IDs remain stable."
    )?.id;
    expect(
      second.claims.find((claim) => claim.statement === "Stored claim IDs remain stable.")?.id
    ).toBe(originalId);
  });

  it("fails closed when task acceptance-criterion linkage is absent", () => {
    const result = mapAssuranceClaims({
      task: { ...task, requirementIds: ["REQ999"], acceptanceCriterionIds: ["AC001"] },
      spec,
      traceability,
      oraclePlan,
      changeUnits
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("not authoritatively linked");
  });
});
