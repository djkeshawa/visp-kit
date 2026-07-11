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
});
