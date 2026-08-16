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

  // The graph-wide sweep and the selected-task error both used to print the
  // repair, so verify put the same `Append to "entries"` JSON on screen twice.
  // A reader who copied the whole block wrote the entry twice and ended up with
  // two traceability entries for one requirement.
  it("states the repair for an untraced selected task once, so the output can be pasted whole", () => {
    const result = validateTraceability({
      taskGraph: validTaskGraph,
      task: validTaskGraph.tasks[0],
      traceability: { ...validTraceabilityMatrix, entries: [] },
      explicit: true
    });

    const text = result.errors.join("\n");

    expect(text.split('Append to "entries"')).toHaveLength(2);
    expect(text.split("traceability.json does not list")).toHaveLength(2);
    // The reader still gets a line naming the task they asked about.
    expect(text).toContain("T001 is missing from traceability.json.");
    expect(text).toContain("apply it once");
  });

  it("still prints the repair for a selected task the task graph does not contain", () => {
    const result = validateTraceability({
      taskGraph: { ...validTaskGraph, tasks: [] },
      task: validTaskGraph.tasks[0],
      traceability: { ...validTraceabilityMatrix, entries: [] },
      explicit: true
    });

    const text = result.errors.join("\n");

    expect(text).toContain("T001 is missing from traceability.json.");
    expect(text.split('Append to "entries"')).toHaveLength(2);
  });

  it("offers no entry repair for a task that names no requirement", () => {
    const unanchored = { ...validTaskGraph.tasks[0]!, requirementIds: [] };
    const result = validateTraceability({
      taskGraph: { ...validTaskGraph, tasks: [unanchored] },
      task: unanchored,
      traceability: { ...validTraceabilityMatrix, entries: [] },
      explicit: true
    });

    const text = result.errors.join("\n");

    // An entry can only exist for a requirement that exists, so there is
    // nothing to name. Pointing at one anyway is what produced traceability
    // entries for phantom requirements; the real repair is the mapping error.
    expect(text).toContain("Traceability is missing task T001.");
    expect(text).toContain("T001 is missing from traceability.json.");
    expect(text).toContain("must map to at least one requirement");
    expect(text).not.toContain("taskIds");
    expect(text).not.toContain('Append to "entries"');
  });
});
