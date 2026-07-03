import { describe, expect, it } from "vitest";

import { validateTraceability } from "../../../src/verification/traceability-validator.js";
import { validTaskGraph, validTraceabilityMatrix } from "../artifacts/fixtures.js";

describe("traceability validator", () => {
  it("catches missing requirement references", () => {
    const result = validateTraceability({
      taskGraph: {
        ...validTaskGraph,
        tasks: [
          {
            ...validTaskGraph.tasks[0]!,
            requirementIds: ["REQ-MISSING"]
          }
        ]
      },
      spec: {
        featureId: "001",
        featureSlug: "note-pinning",
        title: "Add note pinning",
        status: "ready",
        userStories: [],
        requirements: [],
        acceptanceCriteria: [],
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
      traceability: validTraceabilityMatrix,
      explicit: true
    });

    expect(result.status).toBe("failed");
    expect(result.errors.join(" ")).toContain("REQ-MISSING");
  });

  it("fails when selected task is missing from traceability", () => {
    const result = validateTraceability({
      taskGraph: validTaskGraph,
      task: validTaskGraph.tasks[0],
      traceability: {
        ...validTraceabilityMatrix,
        entries: []
      },
      explicit: true
    });

    expect(result.status).toBe("failed");
    expect(result.errors.join(" ")).toContain("T001");
  });
});
