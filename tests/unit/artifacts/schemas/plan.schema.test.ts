import { describe, expect, it } from "vitest";

import {
  planArtifactSchema,
  planDraftArtifactSchema
} from "../../../../src/artifacts/schemas/plan.schema.js";
import { validPlan } from "../fixtures.js";

describe("plan schema", () => {
  it("accepts valid plan artifacts with decisions", () => {
    expect(planArtifactSchema.safeParse(validPlan).success).toBe(true);
  });

  it("accepts valid phase 7 plan drafts", () => {
    expect(
      planDraftArtifactSchema.safeParse({
        featureId: "001",
        featureSlug: "add-note-pinning",
        status: "draft",
        evidence: {
          knownFromUser: ["user"],
          knownFromSpecification: ["spec"],
          knownFromCodebase: ["code"],
          knownFromConstitution: ["constitution"],
          inferred: ["inferred"],
          assumed: ["assumed"],
          unknown: ["unknown"]
        },
        affectedModules: [
          { moduleOrFileArea: "src", reason: "TBD", evidence: "TBD" }
        ],
        implementationApproach: "TBD",
        impacts: {
          dataModel: "None",
          api: "None",
          ui: "None",
          securityPrivacy: "None",
          performance: "None"
        },
        testingStrategy: [
          { level: "unit", whatToTest: "TBD", validationCommand: "pnpm test" }
        ],
        rollbackStrategy: "TBD",
        alternatives: [{ option: "A", decision: "rejected", reason: "TBD" }],
        dependencies: {
          newDependenciesRequired: false,
          notes: "No new dependencies.",
          requiresApproval: false
        },
        risks: [
          {
            id: "RISK001",
            description: "TBD",
            level: "medium",
            mitigation: "TBD",
            requirementIds: ["REQ001"]
          }
        ],
        decisions: [
          {
            id: "PD001",
            title: "TBD",
            decision: "TBD",
            reason: "TBD",
            evidence: "TBD",
            impacts: "TBD",
            requirementIds: ["REQ001"]
          }
        ],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }).success
    ).toBe(true);
  });

  it("rejects invalid risk levels", () => {
    const result = planArtifactSchema.safeParse({
      ...validPlan,
      risks: [{ ...validPlan.risks[0], level: "critical" }]
    });

    expect(result.success).toBe(false);
  });
});
