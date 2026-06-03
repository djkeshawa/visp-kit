import { describe, expect, it } from "vitest";

import {
  reconcileDependencies,
  reconcileRequirementCoverage,
  reconcileTaskAlignment
} from "../../../src/reconcile/reconcile-drift.js";
import { validTaskGraph, validRequirement } from "../artifacts/fixtures.js";

describe("reconcile drift", () => {
  it("fails missing task requirement references", () => {
    const result = reconcileRequirementCoverage({
      task: { ...validTaskGraph.tasks[0]!, requirementIds: ["REQ-MISSING"] },
      taskGraph: validTaskGraph,
      spec: {
        featureId: "001",
        featureSlug: "note-pinning",
        title: "Add note pinning",
        status: "ready",
        userStories: [],
        requirements: [validRequirement],
        acceptanceCriteria: validRequirement.acceptanceCriteria,
        businessRules: [],
        nonFunctionalRequirements: {
          performance: [],
          security: [],
          accessibility: [],
          reliability: [],
          maintainability: []
        },
        edgeCases: [],
        assumptions: [],
        outOfScope: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      changedFiles: []
    });

    expect(result.requirementCoverage.status).toBe("failed");
    expect(result.findings[0]?.driftType).toBe("unmapped_requirement");
  });

  it("fails missing task acceptance criterion references", () => {
    const result = reconcileRequirementCoverage({
      task: { ...validTaskGraph.tasks[0]!, acceptanceCriterionIds: ["AC-MISSING"] },
      taskGraph: validTaskGraph,
      spec: {
        featureId: "001",
        featureSlug: "note-pinning",
        title: "Add note pinning",
        status: "ready",
        userStories: [],
        requirements: [validRequirement],
        acceptanceCriteria: validRequirement.acceptanceCriteria,
        businessRules: [],
        nonFunctionalRequirements: {
          performance: [],
          security: [],
          accessibility: [],
          reliability: [],
          maintainability: []
        },
        edgeCases: [],
        assumptions: [],
        outOfScope: [],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      },
      changedFiles: []
    });

    expect(result.requirementCoverage.status).toBe("failed");
    expect(result.findings[0]?.driftType).toBe("unmapped_acceptance_criterion");
  });

  it("warns when context pack is missing", () => {
    const result = reconcileTaskAlignment({
      task: validTaskGraph.tasks[0],
      changedFiles: [],
      contextPackFound: false,
      validationEvidenceFound: true
    });

    expect(result.taskAlignment.status).toBe("warnings");
    expect(result.findings[0]?.title).toBe("Context pack missing");
  });

  it("does not treat placeholder allowedFiles as strict scope", () => {
    const result = reconcileTaskAlignment({
      task: { ...validTaskGraph.tasks[0]!, allowedFiles: ["TBD"] },
      changedFiles: [
        {
          path: "src/notes.ts",
          changeType: "modified",
          additions: 1,
          deletions: 0,
          mappingStatus: "unmapped",
          isTestFile: false,
          isDependencyFile: false,
          isVispGeneratedFile: false,
          isAllowedByTask: false,
          isExpectedByTask: false,
          isForbiddenByTask: false,
          relatedTaskIds: [],
          relatedRequirementIds: [],
          relatedAcceptanceCriterionIds: [],
          notes: []
        }
      ],
      contextPackFound: true,
      validationEvidenceFound: true
    });

    expect(result.taskAlignment.errors).toEqual([]);
  });

  it("fails package.json changes without dependency approval", () => {
    const result = reconcileDependencies({
      changedFiles: [
        {
          path: "package.json",
          changeType: "modified",
          additions: 1,
          deletions: 0,
          mappingStatus: "dependency",
          isTestFile: false,
          isDependencyFile: true,
          isVispGeneratedFile: false,
          isAllowedByTask: false,
          isExpectedByTask: false,
          isForbiddenByTask: false,
          relatedTaskIds: [],
          relatedRequirementIds: [],
          relatedAcceptanceCriterionIds: [],
          notes: []
        }
      ],
      task: { ...validTaskGraph.tasks[0]!, forbiddenFiles: [] }
    });

    expect(result.dependencyEvidence.status).toBe("failed");
    expect(result.findings[0]?.driftType).toBe("dependency_change_without_approval");
  });
});
