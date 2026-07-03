import { describe, expect, it } from "vitest";

import { type SpecArtifact } from "../../../src/artifacts/schemas/spec.schema.js";
import { selectContextPack } from "../../../src/context/context-selector.js";
import { contextBudgetPolicy } from "../../../src/context/context-budget.js";
import {
  timestamp,
  validFeature,
  validRequirement,
  validTaskGraph
} from "../artifacts/fixtures.js";

const feature = {
  id: "001",
  slug: "note-pinning",
  key: "001-note-pinning",
  path: "/workspace/.visp/features/001-note-pinning",
  relativePath: ".visp/features/001-note-pinning",
  intent: {
    ...validFeature,
    rawUserRequest: "Add note pinning"
  }
};

describe("context selector", () => {
  it("includes only selected task requirements and marks missing files as new-file", async () => {
    const otherRequirement = {
      ...validRequirement,
      id: "REQ-002",
      title: "Other",
      acceptanceCriteria: [
        {
          ...validRequirement.acceptanceCriteria[0]!,
          id: "AC-002",
          requirementId: "REQ-002"
        }
      ]
    };
    const spec: SpecArtifact = {
      featureId: "001",
      featureSlug: "note-pinning",
      title: "Add note pinning",
      status: "ready",
      userStories: [],
      requirements: [validRequirement, otherRequirement],
      acceptanceCriteria: [
        ...validRequirement.acceptanceCriteria,
        ...otherRequirement.acceptanceCriteria
      ],
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
      createdAt: timestamp,
      updatedAt: timestamp
    };

    const pack = await selectContextPack({
      targetPath: "/workspace",
      feature,
      taskGraph: validTaskGraph,
      task: validTaskGraph.tasks[0]!,
      policy: contextBudgetPolicy("lean"),
      includeFullFiles: false,
      now: timestamp,
      spec,
      compactConstitution: "C001: Keep AI context task-specific and token-efficient.\n",
      fileIndex: [],
      fileSummaries: [],
      warnings: []
    });

    expect(pack.includedRequirements.map((requirement) => requirement.id)).toEqual(["REQ-001"]);
    expect(pack.includedAcceptanceCriteria.map((criterion) => criterion.id)).toEqual(["AC-001"]);
    expect(pack.includedFiles[0]?.includeMode).toBe("new-file");
  });
});
