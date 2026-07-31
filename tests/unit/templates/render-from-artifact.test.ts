import { describe, expect, it } from "vitest";

import { type PlanDraftArtifact } from "../../../src/artifacts/schemas/plan.schema.js";
import { type SpecArtifact } from "../../../src/artifacts/schemas/spec.schema.js";
import { type TaskGraphArtifact } from "../../../src/artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../../../src/artifacts/schemas/traceability.schema.js";
import {
  renderPlanMarkdownFromArtifact,
  renderSpecMarkdownFromArtifact,
  renderTasksMarkdownFromArtifact,
  renderTraceabilityMarkdownFromArtifact
} from "../../../src/templates/phase7-templates.js";
import { type ActiveFeature } from "../../../src/workflows/shared/active-feature.js";

const now = "2026-01-01T00:00:00.000Z";

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
    rawUserRequest: "Let users pin notes so they stay at the top of the list.",
    status: "draft",
    budgetMode: "lean",
    riskLevel: "medium",
    createdAt: now,
    updatedAt: now
  }
};

const spec: SpecArtifact = {
  featureId: "001",
  featureSlug: "add-note-pinning",
  title: "Add note pinning",
  status: "ready",
  userStories: [
    {
      id: "US001",
      title: "Pin a note",
      actor: "note user",
      capability: "pin and unpin a note",
      outcome: "important notes remain at the top"
    }
  ],
  requirements: [
    {
      id: "REQ001",
      featureId: "001",
      title: "Persist note pin state",
      description: "The note store must persist whether each note is pinned.",
      source: "user",
      priority: "must",
      acceptanceCriteria: [
        {
          id: "AC001",
          requirementId: "REQ001",
          description: "Pinning a note places it before unpinned notes.",
          testable: true,
          validationMethod: "unit"
        }
      ],
      assumptions: [
        {
          id: "REQ001-ASM001",
          description: "The note model can accept a boolean pinned field."
        }
      ],
      outOfScope: ["Reordering pinned notes by hand."]
    }
  ],
  acceptanceCriteria: [
    {
      id: "AC001",
      requirementId: "REQ001",
      description: "Pinning a note places it before unpinned notes.",
      testable: true,
      validationMethod: "unit"
    }
  ],
  businessRules: ["Pinned notes sort before unpinned notes."],
  nonFunctionalRequirements: {
    performance: ["Sorting remains linearithmic in the number of notes."],
    security: ["Pinning does not change note authorization."],
    accessibility: ["Pinned state is available to assistive technology."],
    reliability: ["Pin state survives a store reload."],
    maintainability: ["Pin ordering is covered by unit tests."]
  },
  edgeCases: ["Unpinning the only pinned note restores normal ordering."],
  assumptions: [
    {
      id: "ASM001",
      description: "Repository state may include user changes."
    }
  ],
  outOfScope: ["Cross-device synchronization of pin state."],
  createdAt: now,
  updatedAt: now
};

const plan: PlanDraftArtifact = {
  featureId: "001",
  featureSlug: "add-note-pinning",
  status: "ready",
  evidence: {
    knownFromUser: ["Pinned notes should stay at the top."],
    knownFromSpecification: ["REQ001 and AC001 define pin persistence and ordering."],
    knownFromCodebase: ["src/notes/store.ts owns note persistence."],
    knownFromConstitution: ["Keep changes task-scoped and tested."],
    inferred: ["Existing note ordering can be extended without a new dependency."],
    assumed: ["The note model can accept a boolean pinned field."],
    unknown: ["No migration is needed for existing in-memory fixtures."]
  },
  affectedModules: [
    {
      moduleOrFileArea: "src/notes/store.ts",
      reason: "Persist and sort the pin state.",
      evidence: "REQ001 and the existing store boundary."
    }
  ],
  implementationApproach: "Add pin state to the note store and cover grouped ordering with tests.",
  impacts: {
    dataModel: "Add a default-false pinned field.",
    api: "Expose pin and unpin store operations.",
    ui: "No UI change in this task.",
    securityPrivacy: "No authorization change.",
    performance: "One grouped sort when listing notes."
  },
  testingStrategy: [
    {
      level: "unit",
      whatToTest: "Pin persistence, unpin behavior, and stable grouped ordering.",
      validationCommand: "pnpm test"
    }
  ],
  rollbackStrategy: "Remove the field and pin operations if validation fails.",
  alternatives: [
    {
      option: "Maintain a separate pinned-note index.",
      decision: "rejected",
      reason: "It adds state synchronization without a demonstrated need."
    }
  ],
  dependencies: {
    newDependenciesRequired: false,
    notes: "No new dependencies approved for this feature.",
    requiresApproval: true
  },
  risks: [
    {
      id: "RISK001",
      description: "Existing note fixtures may omit the new field.",
      level: "medium",
      mitigation: "Default missing pin state to false and add regression tests.",
      requirementIds: ["REQ001"]
    }
  ],
  decisions: [
    {
      id: "PD001",
      title: "Store pin state on the note",
      decision: "Use a default-false boolean field.",
      reason: "It keeps persistence and ordering in one model.",
      evidence: "REQ001; src/notes/store.ts",
      impacts: "Note fixtures and store sorting.",
      requirementIds: ["REQ001"]
    }
  ],
  createdAt: now,
  updatedAt: now
};

const taskGraph: TaskGraphArtifact = {
  featureId: "001",
  featureSlug: "add-note-pinning",
  status: "ready",
  tasks: [
    {
      id: "T001",
      title: "Implement note pin persistence",
      description: "Add pin operations with focused unit tests.",
      requirementIds: ["REQ001"],
      acceptanceCriterionIds: ["AC001"],
      dependsOn: [],
      allowedFiles: ["src/notes/store.ts"],
      expectedFiles: ["tests/unit/notes/store.test.ts"],
      forbiddenFiles: ["package.json"],
      validationCommands: ["pnpm test"],
      status: "ready",
      parallelizable: false,
      riskLevel: "medium",
      taskClass: "bounded_feature",
      riskFactors: [{ version: "1.0", code: "public_api" }]
    }
  ],
  createdAt: now,
  updatedAt: now
};

const traceability: TraceabilityMatrix = {
  featureId: "001",
  featureSlug: "add-note-pinning",
  entries: [
    {
      requirementId: "REQ001",
      acceptanceCriterionIds: ["AC001"],
      planDecisionIds: ["PD001"],
      taskIds: ["T001"],
      filePaths: ["src/notes/store.ts"],
      testPaths: ["tests/unit/notes/store.test.ts"],
      testRefs: ["changed:tests/unit/notes/store.test.ts"],
      status: "verified"
    }
  ],
  createdAt: now,
  updatedAt: now
};

function taskGraphWithTasks(tasks: TaskGraphArtifact["tasks"]): TaskGraphArtifact {
  return { ...taskGraph, tasks };
}

function task(id: string, dependsOn: readonly string[]): TaskGraphArtifact["tasks"][number] {
  return {
    ...taskGraph.tasks[0]!,
    id,
    title: `Task ${id}`,
    dependsOn: [...dependsOn]
  };
}

function implementationOrder(markdown: string): readonly string[] {
  const section = markdown.split("## Suggested Implementation Order")[1] ?? "";
  const body = section.split("## ")[0] ?? "";

  return [...body.matchAll(/^\d+\.\s+(\S+)$/gmu)].map((match) => match[1] ?? "");
}

const renderedSpec = renderSpecMarkdownFromArtifact({ feature, artifact: spec });
const renderedPlan = renderPlanMarkdownFromArtifact({ feature, artifact: plan });
const renderedTasks = renderTasksMarkdownFromArtifact({ feature, artifact: taskGraph });
const renderedTraceability = renderTraceabilityMarkdownFromArtifact({ feature, traceability });

const allRendered = [renderedSpec, renderedPlan, renderedTasks, renderedTraceability];

describe("phase 7 artifact renderers", () => {
  describe("purity", () => {
    it("returns byte-identical output for the same input", () => {
      expect(renderSpecMarkdownFromArtifact({ feature, artifact: spec })).toBe(renderedSpec);
      expect(renderPlanMarkdownFromArtifact({ feature, artifact: plan })).toBe(renderedPlan);
      expect(renderTasksMarkdownFromArtifact({ feature, artifact: taskGraph })).toBe(renderedTasks);
      expect(renderTraceabilityMarkdownFromArtifact({ feature, traceability })).toBe(
        renderedTraceability
      );
    });

    it("never echoes a timestamp into the output", () => {
      for (const markdown of allRendered) {
        expect(markdown).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/u);
        expect(markdown).not.toContain(now);
        expect(markdown).not.toContain("Updated:");
      }
    });

    it("ignores artifact timestamps when producing output", () => {
      expect(
        renderSpecMarkdownFromArtifact({
          feature,
          artifact: { ...spec, createdAt: "2030-06-01T12:00:00.000Z", updatedAt: now }
        })
      ).toBe(renderedSpec);
      expect(
        renderTraceabilityMarkdownFromArtifact({
          feature,
          traceability: { ...traceability, updatedAt: "2030-06-01T12:00:00.000Z" }
        })
      ).toBe(renderedTraceability);
    });
  });

  describe("completeness", () => {
    it("renders every spec field", () => {
      const expected = [
        spec.title,
        spec.featureId,
        spec.featureSlug,
        spec.status,
        feature.intent.rawUserRequest,
        "US001",
        "Pin a note",
        "note user",
        "pin and unpin a note",
        "important notes remain at the top",
        "REQ001",
        "Persist note pin state",
        "The note store must persist whether each note is pinned.",
        "must",
        "user",
        "AC001",
        "Pinning a note places it before unpinned notes.",
        "unit",
        "REQ001-ASM001",
        "The note model can accept a boolean pinned field.",
        "Reordering pinned notes by hand.",
        "Pinned notes sort before unpinned notes.",
        "Sorting remains linearithmic in the number of notes.",
        "Pinning does not change note authorization.",
        "Pinned state is available to assistive technology.",
        "Pin state survives a store reload.",
        "Pin ordering is covered by unit tests.",
        "Unpinning the only pinned note restores normal ordering.",
        "ASM001",
        "Repository state may include user changes.",
        "Cross-device synchronization of pin state."
      ];

      for (const value of expected) expect(renderedSpec).toContain(value);
    });

    it("renders every plan field, including the ones the old markdown hid", () => {
      const expected = [
        plan.featureId,
        plan.featureSlug,
        plan.status,
        ...Object.values(plan.evidence).flat(),
        plan.affectedModules[0]!.moduleOrFileArea,
        plan.affectedModules[0]!.reason,
        plan.affectedModules[0]!.evidence,
        plan.implementationApproach,
        ...Object.values(plan.impacts),
        plan.testingStrategy[0]!.level,
        plan.testingStrategy[0]!.whatToTest,
        plan.testingStrategy[0]!.validationCommand,
        plan.rollbackStrategy,
        plan.alternatives[0]!.option,
        plan.alternatives[0]!.decision,
        plan.alternatives[0]!.reason,
        plan.dependencies.notes,
        plan.risks[0]!.id,
        plan.risks[0]!.description,
        plan.risks[0]!.level,
        plan.risks[0]!.mitigation,
        plan.decisions[0]!.id,
        plan.decisions[0]!.title,
        plan.decisions[0]!.decision,
        plan.decisions[0]!.reason,
        plan.decisions[0]!.evidence,
        plan.decisions[0]!.impacts
      ];

      for (const value of expected) expect(renderedPlan).toContain(value);

      expect(renderedPlan).toContain("New dependencies required: no");
      expect(renderedPlan).toContain("Requires approval: yes");
      expect(renderedPlan).toContain("| RISK001 | Existing note fixtures may omit the new field.");
      expect(renderedPlan.split("## Risks")[1]).toContain("REQ001");
      expect(renderedPlan.split("### PD001")[1]).toContain("REQ001");
    });

    it("renders every task field", () => {
      const [only] = taskGraph.tasks;
      const expected = [
        taskGraph.featureId,
        taskGraph.featureSlug!,
        taskGraph.status!,
        only!.id,
        only!.title,
        only!.description,
        ...only!.requirementIds,
        ...only!.acceptanceCriterionIds,
        ...only!.allowedFiles,
        ...only!.expectedFiles!,
        ...only!.forbiddenFiles!,
        ...only!.validationCommands,
        only!.status,
        only!.riskLevel,
        only!.taskClass!,
        only!.riskFactors![0]!.code
      ];

      for (const value of expected) expect(renderedTasks).toContain(value);

      expect(renderedTasks).toContain("Parallelizable:\nno");
    });

    it("renders all eight traceability entry fields", () => {
      const [entry] = traceability.entries;

      for (const value of [
        entry!.requirementId,
        ...entry!.acceptanceCriterionIds,
        ...entry!.planDecisionIds!,
        ...entry!.taskIds,
        ...entry!.filePaths,
        ...entry!.testPaths,
        ...entry!.testRefs!,
        entry!.status
      ]) {
        expect(renderedTraceability).toContain(value);
      }
    });
  });

  describe("no placeholders", () => {
    it("renders lint-clean artifacts without placeholder tokens", () => {
      for (const markdown of allRendered) {
        expect(markdown).not.toContain("TBD");
        expect(markdown).not.toContain("TBC");
        expect(markdown).not.toContain("TODO");
        expect(markdown).not.toMatch(/<[^>]+>/u);
      }
    });

    it("uses a neutral fallback rather than a placeholder for empty values", () => {
      const emptyTraceability = renderTraceabilityMarkdownFromArtifact({
        feature,
        traceability: {
          ...traceability,
          entries: [
            {
              requirementId: "REQ001",
              acceptanceCriterionIds: [],
              taskIds: [],
              filePaths: [],
              testPaths: [],
              status: "missing"
            }
          ]
        }
      });

      expect(emptyTraceability).toContain("| REQ001 | none | none | none | none | none | none |");
      expect(emptyTraceability).not.toContain("TBD");
    });
  });

  describe("graceful degradation", () => {
    it("falls back to the feature slug when the task graph omits one", () => {
      const { featureSlug: _slug, status: _status, ...withoutSlug } = taskGraph;
      const markdown = renderTasksMarkdownFromArtifact({
        feature,
        artifact: withoutSlug
      });

      expect(markdown).toContain(`- Slug: ${feature.slug}`);
      expect(markdown).toContain("- Status: unspecified");
    });

    it("renders empty artifacts without throwing", () => {
      expect(() =>
        renderTasksMarkdownFromArtifact({ feature, artifact: taskGraphWithTasks([]) })
      ).not.toThrow();
      expect(() =>
        renderTraceabilityMarkdownFromArtifact({
          feature,
          traceability: { ...traceability, entries: [] }
        })
      ).not.toThrow();
      expect(() =>
        renderSpecMarkdownFromArtifact({
          feature,
          artifact: {
            ...spec,
            userStories: [],
            requirements: [],
            acceptanceCriteria: [],
            businessRules: [],
            edgeCases: [],
            assumptions: [],
            outOfScope: []
          }
        })
      ).not.toThrow();
      expect(() =>
        renderPlanMarkdownFromArtifact({
          feature,
          artifact: { ...plan, affectedModules: [], risks: [], decisions: [], alternatives: [] }
        })
      ).not.toThrow();
    });
  });

  describe("topological implementation order", () => {
    it("orders dependants after their dependencies", () => {
      const markdown = renderTasksMarkdownFromArtifact({
        feature,
        artifact: taskGraphWithTasks([
          task("T003", ["T002"]),
          task("T001", []),
          task("T002", ["T001"]),
          task("T004", ["T001"])
        ])
      });
      const order = implementationOrder(markdown);

      expect(order).toEqual(["T001", "T002", "T003", "T004"]);
      expect(order.indexOf("T001")).toBeLessThan(order.indexOf("T002"));
      expect(order.indexOf("T002")).toBeLessThan(order.indexOf("T003"));
    });

    it("breaks ties by input order and stays stable across runs", () => {
      const graph = taskGraphWithTasks([task("T009", []), task("T002", []), task("T005", [])]);
      const first = renderTasksMarkdownFromArtifact({ feature, artifact: graph });
      const second = renderTasksMarkdownFromArtifact({ feature, artifact: graph });

      expect(first).toBe(second);
      expect(implementationOrder(first)).toEqual(["T009", "T002", "T005"]);
    });

    it("degrades to input order instead of hanging on a dependency cycle", () => {
      const markdown = renderTasksMarkdownFromArtifact({
        feature,
        artifact: taskGraphWithTasks([task("T001", ["T002"]), task("T002", ["T001"])])
      });

      expect(implementationOrder(markdown)).toEqual(["T001", "T002"]);
    });

    it("ignores dependencies on tasks outside the graph", () => {
      const markdown = renderTasksMarkdownFromArtifact({
        feature,
        artifact: taskGraphWithTasks([task("T002", ["T999"]), task("T001", [])])
      });

      expect(implementationOrder(markdown)).toEqual(["T002", "T001"]);
    });

    it("points the next step at the first task in the rendered order", () => {
      const markdown = renderTasksMarkdownFromArtifact({
        feature,
        artifact: taskGraphWithTasks([task("T002", ["T001"]), task("T001", [])])
      });

      expect(markdown).toContain("visp context T001");
    });
  });
});
