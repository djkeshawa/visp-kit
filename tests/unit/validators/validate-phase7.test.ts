import { describe, expect, it } from "vitest";

import {
  createClarificationArtifact,
  createSpecArtifact,
  createTaskGraphArtifact,
  createTraceabilitySeed
} from "../../../src/templates/phase7-templates.js";
import { validateClarifications } from "../../../src/validators/validate-clarifications.js";
import { validateSpec } from "../../../src/validators/validate-spec.js";
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
  it("accepts generated clarification and spec scaffolds", () => {
    const clarifications = createClarificationArtifact({ feature, now });
    const spec = createSpecArtifact({ feature, now });
    const traceability = createTraceabilitySeed({ feature, spec, now });

    expect(validateClarifications(clarifications).passed).toBe(true);
    expect(validateSpec({ spec, traceability }).passed).toBe(true);
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

    expect(
      validateTaskGraph({ taskGraph: missingDependency, spec }).errors.join("\n")
    ).toContain("missing task T999");
    expect(
      validateTaskGraph({ taskGraph: circular, spec }).errors.join("\n")
    ).toContain("circular dependency");
  });
});
