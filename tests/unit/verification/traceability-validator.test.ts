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

  // A weak-model evaluation hit these exact messages at the verify stage —
  // bare "Traceability is missing requirement REQ002." with no repair — and
  // concluded the TOOL was misconfigured, then finished the work outside the
  // workflow. The spec and task-graph validators already print the entry to
  // append or the field to extend; verify's traceability check reports the
  // same class of gap and owes the reader the same one-line repair.
  it("tells the reader how to repair a missing task reference", () => {
    const result = validateTraceability({
      taskGraph: validTaskGraph,
      task: validTaskGraph.tasks[0],
      traceability: { ...validTraceabilityMatrix, entries: [] },
      explicit: true
    });

    const text = result.errors.join("\n");
    expect(text).toContain("taskIds");
    expect(text, "the repair must name the requirement whose entry to extend").toContain(
      validTaskGraph.tasks[0]!.requirementIds[0]!
    );
  });
});
