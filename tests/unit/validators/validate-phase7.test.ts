import { describe, expect, it } from "vitest";

import {
  createClarificationArtifact,
  createPlanDraftArtifact,
  createSpecArtifact,
  createTaskGraphArtifact,
  createTraceabilitySeed
} from "../../../src/templates/phase7-templates.js";
import { validateClarifications } from "../../../src/validators/validate-clarifications.js";
import { validateSpec } from "../../../src/validators/validate-spec.js";
import { validatePlan } from "../../../src/validators/validate-plan.js";
import { validateTaskGraph } from "../../../src/validators/validate-task-graph.js";
import { type ActiveFeature } from "../../../src/workflows/shared/active-feature.js";

const feature: ActiveFeature = {
  id: "001",
  slug: "add-note-pinning",
  key: "001-add-note-pinning",
  path: "/project/.visp/features/001-add-note-pinning",
  relativePath: ".visp/features/001-add-note-pinning",
  intent: {
    id: "001",
    slug: "add-note-pinning",
    title: "Add note pinning",
    rawUserRequest: "Add note pinning",
    status: "draft",
    budgetMode: "lean",
    riskLevel: "medium",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
};
const now = "2026-01-01T00:00:00.000Z";

function readyTaskGraph() {
  const taskGraph = createTaskGraphArtifact({ feature, now });

  return {
    ...taskGraph,
    status: "ready" as const,
    tasks: [
      {
        ...taskGraph.tasks[0]!,
        title: "Implement note pinning",
        description: "Add deterministic note pinning behavior.",
        allowedFiles: ["src/notes/store.ts"],
        expectedFiles: ["tests/unit/notes/store.test.ts"],
        validationCommands: ["pnpm test"],
        taskClass: "bounded_feature" as const,
        riskFactors: [{ version: "1.0" as const, code: "public_api" as const }]
      }
    ]
  };
}

describe("phase 7 validators", () => {
  it("rejects generated scaffolds until an agent replaces placeholders and marks them ready", () => {
    const clarifications = createClarificationArtifact({ feature, now });
    const spec = createSpecArtifact({ feature, now });
    const plan = createPlanDraftArtifact({ feature, now });
    const traceability = createTraceabilitySeed({ feature, spec, now });
    const taskGraph = createTaskGraphArtifact({ feature, now });

    expect(validateClarifications(clarifications).passed).toBe(false);
    expect(validateSpec({ spec, traceability }).passed).toBe(false);
    expect(validatePlan(plan).passed).toBe(false);
    expect(validateTaskGraph({ taskGraph, spec, traceability }).passed).toBe(false);

    expect(validateSpec({ spec, traceability }).errors.join("\n")).toContain("placeholder text");
    expect(validateTaskGraph({ taskGraph, spec, traceability }).errors.join("\n")).toContain(
      "concrete validation command"
    );
  });

  it("catches missing task dependencies and cycles", () => {
    const spec = createSpecArtifact({ feature, now });
    const taskGraph = createTaskGraphArtifact({ feature, now });
    const missingDependency = {
      ...taskGraph,
      tasks: [{ ...taskGraph.tasks[0]!, dependsOn: ["T999"] }]
    };
    const circular = {
      ...taskGraph,
      tasks: [{ ...taskGraph.tasks[0]!, dependsOn: ["T001"] }]
    };

    expect(validateTaskGraph({ taskGraph: missingDependency, spec }).errors.join("\n")).toContain(
      "missing task T999"
    );
    expect(validateTaskGraph({ taskGraph: circular, spec }).errors.join("\n")).toContain(
      "circular dependency"
    );
  });

  it("requires task class and risk factors before a task graph is ready", () => {
    const spec = createSpecArtifact({ feature, now });
    const classified = readyTaskGraph();
    const { taskClass: _taskClass, ...withoutTaskClass } = classified.tasks[0]!;
    const { riskFactors: _riskFactors, ...withoutRiskFactors } = classified.tasks[0]!;

    const missingTaskClass = validateTaskGraph({
      taskGraph: { ...classified, tasks: [withoutTaskClass] },
      spec
    });
    const missingRiskFactors = validateTaskGraph({
      taskGraph: { ...classified, tasks: [withoutRiskFactors] },
      spec
    });

    expect(missingTaskClass.errors).toContain(
      "T001 must declare taskClass before the task graph is ready."
    );
    expect(missingRiskFactors.errors).toContain(
      "T001 must declare riskFactors before the task graph is ready."
    );
  });

  it("accepts a ready graph with explicit independent classification metadata", () => {
    const spec = createSpecArtifact({ feature, now });

    expect(validateTaskGraph({ taskGraph: readyTaskGraph(), spec })).toEqual({
      passed: true,
      errors: []
    });
  });

  it("does not invent a task class in the draft task-graph template", () => {
    const taskGraph = createTaskGraphArtifact({ feature, now });

    expect(taskGraph.tasks[0]).not.toHaveProperty("taskClass");
  });
});
