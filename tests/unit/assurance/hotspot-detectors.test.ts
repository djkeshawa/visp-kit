import { describe, expect, it } from "vitest";

import { detectAssuranceHotspots } from "../../../src/assurance/hotspot-detectors.js";
import { type AssuranceCaseWithoutHash } from "../../../src/artifacts/schemas/assurance-case.schema.js";
import { type OverrideRecord } from "../../../src/artifacts/schemas/override.schema.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";

type ChangeUnit = AssuranceCaseWithoutHash["changeUnits"][number];
type Category = AssuranceCaseWithoutHash["hotspots"][number]["category"];

const sha = `sha256:${"a".repeat(64)}` as const;
const claim: AssuranceCaseWithoutHash["claims"][number] = {
  id: "CL001",
  source: {
    kind: "acceptance_criterion",
    requirementId: "REQ001",
    acceptanceCriterionId: "AC001"
  },
  priority: "must",
  assuranceProfile: "behavioral",
  statement: "Behavior works.",
  disposition: "mapped",
  changeUnitIds: ["CU001"],
  evidenceComparisonIds: [],
  unresolvedItemIds: []
};
const task: Task = {
  id: "T001",
  title: "Detect hotspots",
  description: "Detect hotspots.",
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"],
  dependsOn: [],
  allowedFiles: ["src"],
  expectedFiles: ["tests"],
  forbiddenFiles: [],
  validationCommands: ["pnpm test"],
  status: "in_progress",
  parallelizable: false,
  riskLevel: "medium",
  taskClass: "bounded_feature",
  riskFactors: []
};

function hunk(
  path: string,
  patch: Partial<Extract<ChangeUnit, { kind: "hunk" }>> = {}
): Extract<ChangeUnit, { kind: "hunk" }> {
  return {
    id: "CU001",
    kind: "hunk",
    path,
    oldStart: 1,
    oldLines: 1,
    newStart: 1,
    newLines: 1,
    patchSha256: sha,
    occurrence: 1,
    ...patch
  };
}

function categories(input: {
  units?: ChangeUnit[];
  taskPatch?: Partial<Task>;
  validationCommands?: string[];
  unmapped?: string[];
  comparisons?: AssuranceCaseWithoutHash["evidenceComparisons"];
  overrides?: OverrideRecord[];
  generatedPaths?: string[];
  patchByChangeUnitId?: Record<string, string>;
  maxScopePaths?: number;
}): Category[] {
  const units = input.units ?? [hunk("src/plain.ts")];
  return detectAssuranceHotspots({
    changeUnits: units,
    claims: [{ ...claim, changeUnitIds: units.map((unit) => unit.id) }],
    evidenceComparisons: input.comparisons ?? [],
    task: { ...task, ...input.taskPatch },
    oraclePlan: { validationCommands: input.validationCommands ?? ["pnpm test"] },
    overrides: input.overrides ?? [],
    unmappedChangeUnitIds: input.unmapped ?? [],
    generatedPaths: input.generatedPaths,
    patchByChangeUnitId: input.patchByChangeUnitId,
    maxScopePaths: input.maxScopePaths
  }).map((hotspot) => hotspot.category);
}

const activeOverride: OverrideRecord = {
  id: "OVR001",
  ruleId: "VSP022",
  scope: "task",
  featureId: "F001",
  featureSlug: "hotspots",
  taskId: "T001",
  stage: "review",
  reason: "Approved assurance profile exception.",
  status: "active",
  createdAt: "2026-07-25T00:00:00.000Z",
  createdBy: "reviewer"
};

describe("detectAssuranceHotspots", () => {
  it.each([
    ["public_api", () => categories({ units: [hunk("src/api/public.ts")] })],
    ["dependency", () => categories({ units: [hunk("package.json")] })],
    ["schema_migration", () => categories({ units: [hunk("src/migrations/001.sql")] })],
    ["security", () => categories({ units: [hunk("src/security/token.ts")] })],
    ["concurrency", () => categories({ units: [hunk("src/workers/queue.ts")] })],
    ["permissions", () => categories({ units: [hunk("src/permissions/acl.ts")] })],
    ["deployment_configuration", () => categories({ units: [hunk("config/deployment.yaml")] })],
    [
      "test_deletion",
      () =>
        categories({
          units: [hunk("tests/a.test.ts", { oldLines: 3, newLines: 0 })],
          patchByChangeUnitId: {
            CU001: '@@ -1,3 +0,0 @@\n-test("removed", () => {});\n-const helper = true;\n'
          }
        })
    ],
    [
      "test_weakening",
      () =>
        categories({
          units: [hunk("tests/a.test.ts", { oldLines: 3, newLines: 1 })],
          patchByChangeUnitId: {
            CU001: "@@ -1,3 +1,1 @@\n-expect(actual).toBe(expected);\n const helper = true;\n"
          }
        })
    ],
    [
      "validation_command_change",
      () => categories({ validationCommands: ["pnpm test --changed"] })
    ],
    ["unmapped_change", () => categories({ unmapped: ["CU001"] })],
    ["scope_expansion", () => categories({ units: [hunk("outside/file.ts")] })],
    [
      "oversized_scope",
      () =>
        categories({
          units: Array.from({ length: 3 }, (_, index) => ({
            ...hunk(`src/file-${index}.ts`),
            id: `CU00${index}`
          })),
          maxScopePaths: 2
        })
    ],
    [
      "inconclusive_evidence",
      () =>
        categories({
          comparisons: [
            {
              id: "EC001",
              providers: [{ id: "vitest", version: "1" }],
              claimIds: ["CL001"],
              baseline: {
                outcome: "failed",
                source: { bindingId: "baseline_evidence", evidenceIds: [] },
                freshness: "fresh",
                independence: "pre_existing",
                uncertainty: { status: "none", reasons: [] }
              },
              candidate: {
                outcome: "inconclusive",
                source: { bindingId: "candidate_evidence", evidenceIds: [] },
                freshness: "unknown",
                independence: "implementer_authored",
                uncertainty: { status: "unresolved", reasons: ["Missing evidence."] }
              },
              conclusion: "inconclusive"
            }
          ]
        })
    ],
    ["override_usage", () => categories({ overrides: [activeOverride] })],
    [
      "generated_behavior",
      () => categories({ units: [hunk("src/output.ts")], generatedPaths: ["src/output.ts"] })
    ]
  ] as const)("detects %s deterministically", (expected, run) => {
    expect(run()).toContain(expected);
  });

  it("does not call ordinary non-assertion test refactoring a weakening", () => {
    expect(
      categories({
        units: [hunk("tests/a.test.ts", { oldLines: 3, newLines: 1 })],
        patchByChangeUnitId: {
          CU001: "@@ -1,3 +1,1 @@\n-const duplicate = setup();\n const retained = setup();\n"
        }
      })
    ).not.toContain("test_weakening");
  });

  it("does not classify a whitespace-prefixed path as its trimmed scope counterpart", () => {
    const result = categories({
      units: [hunk(" src/plain.ts")],
      taskPatch: {
        allowedFiles: ["src/plain.ts"],
        expectedFiles: []
      }
    });

    expect(result).toContain("scope_expansion");
  });

  it("orders critical, high, and medium mandatory hotspots stably", () => {
    const result = detectAssuranceHotspots({
      changeUnits: [
        hunk("src/security/token.ts"),
        { ...hunk("package.json"), id: "CU002" },
        { ...hunk("outside/extra.ts"), id: "CU003" }
      ],
      claims: [{ ...claim, changeUnitIds: ["CU001", "CU002", "CU003"] }],
      evidenceComparisons: [],
      task,
      oraclePlan: { validationCommands: ["pnpm test"] },
      overrides: [activeOverride],
      unmappedChangeUnitIds: []
    });

    expect(result.map((hotspot) => hotspot.id)).toEqual(
      [...result.map((hotspot) => hotspot.id)].sort()
    );
    expect(result.every((hotspot) => hotspot.mandatory)).toBe(true);
  });
});
