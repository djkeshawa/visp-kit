import { describe, expect, it } from "vitest";

import { generateOraclePlan, validateOraclePlan } from "../../../src/oracle/oracle-plan.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { createDefaultPolicy } from "../../../src/policy/policy-defaults.js";
import { validContextPack, validTaskGraph } from "../artifacts/fixtures.js";

function input() {
  const criterion = {
    id: "AC001",
    requirementId: "REQ001",
    description: "The behavior is observable.",
    testable: true,
    validationMethod: "unit" as const
  };
  const requirement = {
    id: "REQ001",
    featureId: "001",
    title: "Observable behavior",
    description: "Expose the required behavior.",
    source: "user" as const,
    priority: "must" as const,
    acceptanceCriteria: [criterion],
    assumptions: [],
    outOfScope: []
  };
  const task: Task = {
    ...validTaskGraph.tasks[0]!,
    id: "T001",
    requirementIds: ["REQ001"],
    acceptanceCriterionIds: ["AC001"],
    validationCommands: ["pnpm test"],
    allowedFiles: ["src/example.ts"],
    expectedFiles: ["tests/example.test.ts"],
    taskClass: "bounded_feature" as const,
    riskLevel: "medium" as const,
    riskFactors: []
  };
  const taskGraph = {
    ...validTaskGraph,
    featureId: "001",
    featureSlug: "example",
    status: "ready" as const,
    tasks: [task]
  };
  const context = {
    ...validContextPack,
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    selectedTask: task,
    includedRequirements: [requirement],
    includedAcceptanceCriteria: [criterion],
    validationCommands: ["pnpm test"]
  };

  return {
    featureId: "001",
    featureSlug: "example",
    task,
    specification: {
      path: ".visp/features/001-example/spec.json",
      value: {
        featureId: "001",
        featureSlug: "example",
        title: "Example",
        status: "ready" as const,
        userStories: [],
        requirements: [requirement],
        acceptanceCriteria: [criterion],
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
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z"
      }
    },
    plan: {
      path: ".visp/features/001-example/plan.json",
      value: {
        featureId: "001",
        featureSlug: "example",
        status: "ready" as const,
        evidence: {
          knownFromUser: [],
          knownFromSpecification: [],
          knownFromCodebase: [],
          knownFromConstitution: [],
          inferred: [],
          assumed: [],
          unknown: []
        },
        affectedModules: [],
        implementationApproach: "Implement the behavior.",
        impacts: {
          dataModel: "None.",
          api: "None.",
          ui: "None.",
          securityPrivacy: "None.",
          performance: "None."
        },
        testingStrategy: [
          { level: "unit", whatToTest: "Behavior.", validationCommand: "pnpm test" }
        ],
        rollbackStrategy: "Revert.",
        alternatives: [],
        dependencies: {
          newDependenciesRequired: false,
          notes: "None.",
          requiresApproval: false
        },
        risks: [],
        decisions: [],
        createdAt: "2026-07-25T00:00:00.000Z",
        updatedAt: "2026-07-25T00:00:00.000Z"
      }
    },
    policy: {
      path: ".visp/policy.json",
      value: createDefaultPolicy({ now: "2026-07-25T00:00:00.000Z" })
    },
    taskGraph: {
      path: ".visp/features/001-example/task-graph.json",
      value: taskGraph
    },
    context: {
      path: ".visp/features/001-example/context/T001.context.json",
      value: context
    },
    baseCommit: {
      status: "captured" as const,
      commit: "a".repeat(40)
    },
    testStrengthEvidence: [
      {
        path: "tests/example.test.ts",
        sha256: `sha256:${"b".repeat(64)}` as const,
        independence: "pre_existing" as const,
        source: { kind: "git_base_commit" as const, commit: "a".repeat(40) }
      }
    ],
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
}

describe("oracle plan generation", () => {
  it("generates deterministic behavioral expectations and bindings", () => {
    const first = generateOraclePlan(input());
    const second = generateOraclePlan(input());

    expect(first).toEqual(second);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.assuranceProfile).toBe("behavioral");
    expect(first.value.oracles[0]).toMatchObject({
      acceptanceCriterionId: "AC001",
      baseline: { expected: "recorded" },
      candidate: { expected: "passed" }
    });
    expect(first.value.bindings.task.sha256).toMatch(/^sha256:[a-f0-9]{64}$/u);
  });

  it("uses a failing baseline for localized bug reproduction", () => {
    const value = input();
    value.task.taskClass = "localized_bug";
    value.taskGraph.value.tasks[0]!.taskClass = "localized_bug";
    value.context.value.selectedTask.taskClass = "localized_bug";

    const result = generateOraclePlan(value);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.oracles[0]?.baseline.expected).toBe("failed");
  });

  it("fails closed for stale criteria and modified plans", () => {
    const stale = input();
    stale.context.value.includedAcceptanceCriteria = [];
    const missing = generateOraclePlan(stale);
    expect(missing.ok).toBe(false);

    const current = generateOraclePlan(input());
    expect(current.ok).toBe(true);
    if (!current.ok) return;
    const tampered = {
      ...current.value,
      validationCommands: ["pnpm test -- --changed"]
    };
    expect(validateOraclePlan(tampered, input()).ok).toBe(false);
  });

  it("rejects pre-existing evidence not bound to the base commit", () => {
    const value = input();
    value.testStrengthEvidence[0]!.source.commit = "c".repeat(40);

    expect(generateOraclePlan(value).ok).toBe(false);
  });
});
