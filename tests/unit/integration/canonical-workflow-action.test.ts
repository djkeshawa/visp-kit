import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkflowActionId } from "../../../src/integration/canonical-json.js";
import {
  buildCanonicalWorkflowAction,
  canonicalWorkflowActionJson
} from "../../../src/integration/canonical-workflow-action.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { type NextStep } from "../../../src/orchestrator/next-step.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import {
  timestamp,
  validContextPack,
  validFeature,
  validRequirement,
  validTaskGraph
} from "../artifacts/fixtures.js";

const featurePath = ".visp/features/001-note-pinning";
const nextCommand = "Use .visp/prompts/current-task.prompt.md with your agent";
const criterion = {
  ...validRequirement.acceptanceCriteria[0]!,
  description: "Context-selected pinned notes behavior."
};
const requirement = {
  ...validRequirement,
  description: "Context-selected pinning requirement.",
  acceptanceCriteria: [criterion]
};
const task = {
  ...validTaskGraph.tasks[0]!,
  status: "ready" as const,
  dependsOn: ["T000", "T000"],
  allowedFiles: ["src\\notes\\sort.ts", "src/notes/sort.ts"],
  expectedFiles: ["tests/notes/sort test.ts", "tests\\notes\\sort test.ts"],
  forbiddenFiles: ["package.json", "package.json"],
  validationCommands: ["pnpm test"],
  parallelizable: true,
  riskLevel: "medium" as const
};

const readFixtures = [
  {
    id: "project-policy",
    path: ".visp/policy.json",
    role: "policy",
    contents: '{"strictnessMode":"strict"}\n'
  },
  {
    id: "feature-intent",
    path: `${featurePath}/intent.json`,
    role: "intent",
    contents: '{"rawUserRequest":"Pin notes"}\n'
  },
  {
    id: "feature-specification",
    path: `${featurePath}/spec.json`,
    role: "specification",
    contents: '{"featureId":"001"}\n'
  },
  {
    id: "feature-plan",
    path: `${featurePath}/plan.json`,
    role: "plan",
    contents: '{"featureId":"001"}\n'
  },
  {
    id: "task-graph",
    path: `${featurePath}/task-graph.json`,
    role: "task_graph",
    contents: '{"featureId":"001","tasks":["T001"]}\n'
  },
  {
    id: "task-context",
    path: `${featurePath}/context/T001.context.json`,
    role: "context_pack",
    contents: '{"featureId":"001","taskId":"T001"}\n'
  },
  {
    id: "implementation-prompt",
    path: ".visp/prompts/current-task.prompt.md",
    role: "implementation_prompt",
    contents: "# Task T001\n"
  }
] as const;

function sha256(contents: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(contents, "utf8").digest("hex")}`;
}

async function writeReadFixtures(
  targetPath: string,
  omittedPaths: ReadonlySet<string> = new Set()
): Promise<void> {
  for (const fixture of readFixtures) {
    if (omittedPaths.has(fixture.path)) continue;
    const absolutePath = join(targetPath, fixture.path);
    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, fixture.contents, "utf8");
  }
}

function specArtifact() {
  const specCriterion = {
    ...criterion,
    description: "Specification fallback criterion."
  };
  const specRequirement = {
    ...requirement,
    description: "Specification fallback requirement.",
    acceptanceCriteria: [specCriterion]
  };

  return {
    featureId: "001",
    featureSlug: "note-pinning",
    title: "Add note pinning",
    status: "ready" as const,
    userStories: [],
    requirements: [specRequirement],
    acceptanceCriteria: [specCriterion],
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
}

function contextPack() {
  return {
    ...validContextPack,
    selectedTask: task,
    includedRequirements: [requirement],
    includedAcceptanceCriteria: [criterion],
    validationCommands: ["pnpm test", "pnpm typecheck"],
    strictnessMode: "strict" as const,
    policyStatus: "valid" as const,
    policyGate: {
      strictnessMode: "strict" as const,
      policyStatus: "valid" as const,
      stage: "context" as const,
      allowed: true,
      failedRules: [],
      blockedCommands: [],
      overriddenRules: ["VSP007"],
      appliedOverrides: [
        {
          overrideId: "OVR-001",
          ruleId: "VSP007",
          scope: "task" as const,
          reason: "Approved context exception.",
          expiresAt: null,
          appliedToStage: "context" as const,
          appliedToFeatureId: "001",
          appliedToTaskId: "T001"
        }
      ],
      warnings: [],
      nextAllowedCommand: nextCommand,
      nextCommand,
      evaluatedAt: timestamp
    }
  };
}

function projectState(targetPath: string, overrides: Partial<ProjectState> = {}): ProjectState {
  const base: ProjectState = {
    targetPath,
    initialized: true,
    selectedFeature: {
      id: "001",
      slug: "note-pinning",
      key: "001-note-pinning",
      relativePath: featurePath,
      intent: {
        ...validFeature,
        rawUserRequest: "Pin notes"
      }
    },
    selectedTask: task,
    taskGraph: {
      ...validTaskGraph,
      tasks: [task]
    },
    spec: specArtifact(),
    contextPack: contextPack(),
    artifactSummary: {
      clarifications: true,
      spec: true,
      plan: true,
      taskGraph: true,
      traceability: true,
      context: true,
      verification: false,
      review: false,
      reconcile: false,
      pr: false
    },
    taskSummary: {
      total: 1,
      ready: 1,
      pending: 0,
      inProgress: 0,
      blocked: 0,
      done: 0,
      verified: 0
    },
    scanned: true,
    constitution: true,
    scanCacheFiles: {},
    git: {
      isRepo: true,
      branch: "develop",
      stagedCount: 0,
      unstagedCount: 0,
      changedFiles: [],
      warnings: []
    },
    warnings: [],
    errors: []
  };

  return { ...base, ...overrides };
}

function projectStateWithTask(
  targetPath: string,
  selectedTask: Task,
  overrides: Partial<ProjectState> = {}
): ProjectState {
  const state = projectState(targetPath, { ...overrides, selectedTask });

  return {
    ...state,
    taskGraph:
      state.taskGraph === undefined ? undefined : { ...state.taskGraph, tasks: [selectedTask] }
  };
}

function actionStep(targetPath: string, overrides: Partial<NextStep> = {}): NextStep {
  return {
    success: true,
    targetPath,
    feature: { id: "001", slug: "note-pinning" },
    task: { id: task.id, title: task.title, status: task.status },
    state: "implementation-needed",
    nextCommand,
    reason: "The selected task is ready for implementation.",
    blockers: [],
    warnings: [],
    confidence: "high",
    strictnessMode: "strict",
    allowed: true,
    failedRules: [],
    ...overrides
  };
}

function withoutExpectedFiles() {
  const { expectedFiles: _expectedFiles, ...result } = task;
  return result;
}

describe("CanonicalWorkflowAction 1.0", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "visp-canonical-action-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("builds the complete normalized action and deterministic identity", async () => {
    await writeReadFixtures(tempDir);

    const first = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });
    const second = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });
    const { actionId, ...identityInput } = first;

    expect(first).toEqual({
      canonicalVersion: "1.0",
      actionId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
      phase: "implement",
      feature: { id: "001", slug: "note-pinning" },
      task: {
        id: "T001",
        title: "Add note sorting helper",
        status: "ready",
        dependsOn: ["T000"],
        parallelizable: true
      },
      taskClass: { state: "unavailable", reasonCode: "not_in_source_artifact" },
      risk: {
        level: { state: "available", value: "medium" },
        factors: { state: "unavailable", reasonCode: "not_in_source_artifact" }
      },
      assurance: {
        level: "kit_strict",
        profile: { state: "unavailable", reasonCode: "not_in_source_artifact" },
        workflowStrictness: { state: "available", value: "strict" }
      },
      goal: "Implement pinned-first sorting in the note module.",
      baseCommit: { state: "unavailable", reasonCode: "not_captured" },
      requiredReads: readFixtures.map((fixture) => ({
        id: fixture.id,
        role: fixture.role,
        path: fixture.path,
        contentHash: sha256(fixture.contents),
        freshness: "content_hash"
      })),
      scope: {
        writablePaths: ["src/notes/sort.ts", "tests/notes/sort test.ts"],
        expectedPaths: { state: "available", value: ["tests/notes/sort test.ts"] },
        forbiddenPaths: ["package.json"],
        operationLimits: { state: "unavailable", reasonCode: "not_captured" }
      },
      claims: {
        state: "available",
        value: [
          {
            id: "REQ-001",
            statement: "Context-selected pinning requirement.",
            priority: "must",
            acceptanceCriterionIds: ["AC-001"],
            accountableOwner: {
              state: "unavailable",
              reasonCode: "not_in_source_artifact"
            }
          }
        ]
      },
      validationOracles: [
        {
          id: "AC-001",
          claimId: "REQ-001",
          statement: "Context-selected pinned notes behavior.",
          testable: true,
          validationMethod: "unit"
        }
      ],
      validationCommands: ["pnpm test", "pnpm typecheck"],
      requiredEvidence: { state: "unavailable", reasonCode: "not_in_source_artifact" },
      policy: {
        status: { state: "available", value: "valid" },
        appliedOverrides: { state: "unavailable", reasonCode: "not_captured" }
      },
      findings: [],
      verdict: "ready",
      nextCommand
    });
    expect(actionId).toBe(createWorkflowActionId(identityInput));
    expect(first.actionId).toBe(second.actionId);
    expect(canonicalWorkflowActionJson(first)).toBe(canonicalWorkflowActionJson(second));
    expect(canonicalWorkflowActionJson(first)).not.toContain("local_checked");
  });

  it.each([
    ["not-initialized", "setup"],
    ["scan-needed", "setup"],
    ["constitution-needed", "setup"],
    ["feature-needed", "feature"],
    ["clarify-needed", "clarify"],
    ["spec-needed", "spec"],
    ["plan-needed", "plan"],
    ["tasks-needed", "tasks"],
    ["task-missing", "tasks"],
    ["context-needed", "context"],
    ["next-task-needed", "context"],
    ["checklist-needed", "context"],
    ["implementation-needed", "implement"],
    ["verify-needed", "verify"],
    ["verification-failed", "verify"],
    ["review-needed", "review"],
    ["reconcile-needed", "reconcile"],
    ["traceability-update-needed", "reconcile"],
    ["pr-needed", "pr"],
    ["ready-for-pr", "pr"],
    ["feature-future", "next"],
    ["future-state", "next"]
  ] as const)("maps %s to the exact %s phase", async (stateName, phase) => {
    await writeReadFixtures(tempDir);

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { state: stateName })
    });

    expect(action.phase).toBe(phase);
  });

  it("fails closed when the workflow state is not in the canonical mapping", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { state: "future-state" })
    });

    expect(action.phase).toBe("next");
    expect(action.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.WORKFLOW_STATE_UNKNOWN",
          effect: "uncertain",
          evidence: ["future-state"]
        })
      ])
    );
    expect(action.verdict).toBe("inconclusive");
  });

  it.each([
    ["relaxed", "advisory"],
    ["standard", "advisory"],
    ["strict", "kit_strict"],
    ["locked", "kit_strict"]
  ] as const)("maps %s strictness to %s assurance", async (strictnessMode, level) => {
    await writeReadFixtures(tempDir);

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { strictnessMode })
    });

    expect(action.assurance).toMatchObject({
      level,
      workflowStrictness: { state: "available", value: strictnessMode }
    });
    expect(canonicalWorkflowActionJson(action)).not.toContain("local_checked");
  });

  it("keeps absent and invalid strictness honest without inferring strict authority", async () => {
    await writeReadFixtures(tempDir);

    const absent = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { strictnessMode: undefined })
    });
    const invalid = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { strictnessMode: "future" })
    });

    expect(absent.assurance).toMatchObject({
      level: "advisory",
      workflowStrictness: { state: "unavailable", reasonCode: "not_captured" }
    });
    expect(absent.verdict).toBe("ready");
    expect(invalid.assurance).toMatchObject({
      level: "advisory",
      workflowStrictness: { state: "unavailable", reasonCode: "source_invalid" }
    });
    expect(invalid.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.STRICTNESS_INVALID",
          effect: "uncertain"
        })
      ])
    );
    expect(invalid.verdict).toBe("inconclusive");
  });

  it("uses task-scoped claims first and falls back to the filtered specification", async () => {
    await writeReadFixtures(tempDir);

    const fromContext = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });
    const fallbackState = projectState(tempDir, {
      contextPack: undefined,
      artifactSummary: {
        ...projectState(tempDir).artifactSummary,
        context: false
      }
    });
    const fromSpec = await buildCanonicalWorkflowAction({
      state: fallbackState,
      step: actionStep(tempDir)
    });

    expect(fromContext.claims).toMatchObject({
      state: "available",
      value: [expect.objectContaining({ statement: "Context-selected pinning requirement." })]
    });
    expect(fromSpec.claims).toMatchObject({
      state: "available",
      value: [expect.objectContaining({ statement: "Specification fallback requirement." })]
    });
    expect(fromSpec.validationOracles[0]?.statement).toBe("Specification fallback criterion.");
    expect(fromSpec.validationCommands).toEqual(["pnpm test"]);
  });

  it("distinguishes omitted expected paths, available empty paths, and no active task", async () => {
    await writeReadFixtures(tempDir);
    const omittedTask = withoutExpectedFiles();
    const emptyTask = { ...task, expectedFiles: [] };

    const omitted = await buildCanonicalWorkflowAction({
      state: projectStateWithTask(tempDir, omittedTask),
      step: actionStep(tempDir)
    });
    const empty = await buildCanonicalWorkflowAction({
      state: projectStateWithTask(tempDir, emptyTask),
      step: actionStep(tempDir)
    });
    const noTaskState = projectState(tempDir, {
      selectedFeature: undefined,
      selectedTask: undefined,
      taskGraph: undefined,
      spec: undefined,
      contextPack: undefined,
      artifactSummary: {
        clarifications: false,
        spec: false,
        plan: false,
        taskGraph: false,
        traceability: false,
        context: false,
        verification: false,
        review: false,
        reconcile: false,
        pr: false
      }
    });
    const noTask = await buildCanonicalWorkflowAction({
      state: noTaskState,
      step: actionStep(tempDir, {
        feature: null,
        task: null,
        state: "feature-needed",
        nextCommand: 'visp feature "<describe your feature>"'
      })
    });

    expect(omitted.scope.expectedPaths).toEqual({
      state: "unavailable",
      reasonCode: "not_in_source_artifact"
    });
    expect(empty.scope.expectedPaths).toEqual({ state: "available", value: [] });
    expect(noTask.feature).toBeNull();
    expect(noTask.task).toBeNull();
    expect(noTask.taskClass).toEqual({
      state: "not_applicable",
      reasonCode: "no_active_task"
    });
    expect(noTask.risk.level).toEqual({
      state: "not_applicable",
      reasonCode: "no_active_task"
    });
    expect(noTask.claims).toEqual({
      state: "not_applicable",
      reasonCode: "no_active_task"
    });
  });

  it("preserves context and PR scope needed by the unchanged v2 projection", async () => {
    await writeReadFixtures(tempDir);
    const expectedFeatureScope = [
      `${featurePath}/task-graph.json`,
      `${featurePath}/traceability.json`
    ];

    const contextAction = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { state: "context-needed" })
    });
    const prAction = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, { state: "pr-needed" })
    });

    expect(contextAction.scope).toMatchObject({
      writablePaths: expectedFeatureScope,
      expectedPaths: { state: "available", value: expectedFeatureScope }
    });
    expect(prAction.scope).toMatchObject({
      writablePaths: ["src/notes/sort.ts", "tests/notes/sort test.ts"],
      expectedPaths: { state: "available", value: ["tests/notes/sort test.ts"] }
    });
  });

  it("fails closed on missing reads and keeps a coherent policy block authoritative", async () => {
    const missingPath = ".visp/prompts/current-task.prompt.md";
    await writeReadFixtures(tempDir, new Set([missingPath]));

    const uncertain = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });
    const blocked = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        success: false,
        allowed: false,
        failedRules: [
          {
            ruleId: "VSP007",
            severity: "error",
            message: "Implementation requires a context pack.",
            recommendation: "Generate task context.",
            evidence: missingPath
          }
        ]
      })
    });

    expect(uncertain.requiredReads.map((read) => read.path)).not.toContain(missingPath);
    expect(uncertain.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.FRESHNESS.REQUIRED_READ_UNAVAILABLE",
          effect: "uncertain",
          evidence: [missingPath]
        })
      ])
    );
    expect(uncertain.verdict).toBe("inconclusive");
    expect(blocked.findings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: "VSP007", effect: "blocks" })])
    );
    expect(blocked.verdict).toBe("blocked");
  });

  it("makes identity contradictions inconclusive even beside a policy block", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        success: false,
        allowed: false,
        task: { id: "T999", title: "Wrong task", status: "ready" },
        failedRules: [
          {
            ruleId: "VSP007",
            severity: "error",
            message: "Implementation requires a context pack.",
            recommendation: "Generate task context.",
            evidence: "T001"
          }
        ]
      })
    });

    expect(action.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.TASK_IDENTITY_MISMATCH",
          effect: "uncertain"
        }),
        expect.objectContaining({ code: "VSP007", effect: "blocks" })
      ])
    );
    expect(action.verdict).toBe("inconclusive");
  });

  it("fails closed on feature and task-graph identity contradictions", async () => {
    await writeReadFixtures(tempDir);
    const graphTask = { ...task, id: "T999" };
    const graphMismatchState = projectState(tempDir, {
      selectedTask: graphTask,
      contextPack: undefined,
      artifactSummary: {
        ...projectState(tempDir).artifactSummary,
        context: false
      }
    });

    const featureMismatch = await buildCanonicalWorkflowAction({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        feature: { id: "999", slug: "wrong-feature" }
      })
    });
    const graphMismatch = await buildCanonicalWorkflowAction({
      state: graphMismatchState,
      step: actionStep(tempDir, {
        task: { id: graphTask.id, title: graphTask.title, status: graphTask.status }
      })
    });

    expect(featureMismatch.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VISP.CONTRACT.FEATURE_IDENTITY_MISMATCH" })
      ])
    );
    expect(featureMismatch.verdict).toBe("inconclusive");
    expect(graphMismatch.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.SOURCE_IDENTITY_MISMATCH",
          evidence: ["task-graph:missing-task:T999"]
        })
      ])
    );
    expect(graphMismatch.verdict).toBe("inconclusive");
  });

  it("fails closed when a required feature intent is readable but invalid", async () => {
    await writeReadFixtures(tempDir);
    const invalidIntent = "{not-valid-json\n";
    await writeFile(join(tempDir, featurePath, "intent.json"), invalidIntent, "utf8");
    const state = projectState(tempDir, {
      selectedFeature: {
        ...projectState(tempDir).selectedFeature!,
        intent: undefined
      },
      warnings: ["feature intent is unreadable: invalid JSON"]
    });

    const action = await buildCanonicalWorkflowAction({
      state,
      step: actionStep(tempDir)
    });

    expect(action.requiredReads).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "feature-intent", contentHash: sha256(invalidIntent) })
      ])
    );
    expect(action.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.FEATURE_INTENT_UNAVAILABLE",
          effect: "uncertain"
        })
      ])
    );
    expect(action.verdict).toBe("inconclusive");
  });

  it("fails closed on project-state selection errors", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir, { errors: ["Task not found: T999."] }),
      step: actionStep(tempDir)
    });

    expect(action.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VISP.CONTRACT.PROJECT_STATE_ERROR",
          effect: "uncertain",
          evidence: ["Task not found: T999."]
        })
      ])
    );
    expect(action.verdict).toBe("inconclusive");
  });

  it("normalizes safe paths and rejects absolute or traversal scope", async () => {
    await writeReadFixtures(tempDir);
    const unsafeTask = {
      ...task,
      allowedFiles: [
        "src\\notes\\safe file.ts",
        "src/notes/safe file.ts",
        "/etc/passwd",
        "C:\\secrets.txt",
        "\\\\server\\share\\file.ts",
        "../escape.ts",
        "src/./hidden.ts"
      ]
    };

    const action = await buildCanonicalWorkflowAction({
      state: projectStateWithTask(tempDir, unsafeTask),
      step: actionStep(tempDir)
    });

    expect(action.scope.writablePaths).toEqual([
      "src/notes/safe file.ts",
      "tests/notes/sort test.ts"
    ]);
    expect(
      action.findings.filter((finding) => finding.code === "VISP.CONTRACT.INVALID_PROJECT_PATH")
    ).toHaveLength(5);
    expect(action.verdict).toBe("inconclusive");
  });

  it("marks missing task mappings unavailable instead of inventing claims or oracles", async () => {
    await writeReadFixtures(tempDir);
    const invalidContext = {
      ...contextPack(),
      includedRequirements: [],
      includedAcceptanceCriteria: []
    };

    const action = await buildCanonicalWorkflowAction({
      state: projectState(tempDir, { contextPack: invalidContext }),
      step: actionStep(tempDir)
    });

    expect(action.claims).toEqual({ state: "unavailable", reasonCode: "source_invalid" });
    expect(action.validationOracles).toEqual([]);
    expect(action.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "VISP.CONTRACT.REQUIREMENT_MAPPING_MISSING" }),
        expect.objectContaining({ code: "VISP.CONTRACT.CRITERION_MAPPING_MISSING" })
      ])
    );
    expect(action.verdict).toBe("inconclusive");
  });

  it("changes identity for semantic mutations but not set ordering or duplicates", async () => {
    await writeReadFixtures(tempDir);
    const baseState = projectState(tempDir);
    const baseStep = actionStep(tempDir);
    const base = await buildCanonicalWorkflowAction({ state: baseState, step: baseStep });
    const changedActions = [
      await buildCanonicalWorkflowAction({
        state: baseState,
        step: actionStep(tempDir, { state: "review-needed" })
      }),
      await buildCanonicalWorkflowAction({
        state: projectStateWithTask(tempDir, { ...task, title: "Changed title" }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: projectStateWithTask(tempDir, {
          ...task,
          allowedFiles: [...task.allowedFiles, "src/notes/extra.ts"]
        }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: projectStateWithTask(tempDir, {
          ...task,
          forbiddenFiles: [...task.forbiddenFiles, "pnpm-lock.yaml"]
        }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: projectState(tempDir, {
          contextPack: {
            ...contextPack(),
            includedRequirements: [{ ...requirement, description: "Changed claim." }]
          }
        }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: projectState(tempDir, {
          contextPack: {
            ...contextPack(),
            includedAcceptanceCriteria: [{ ...criterion, description: "Changed oracle." }]
          }
        }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: projectState(tempDir, {
          contextPack: { ...contextPack(), validationCommands: ["pnpm test --changed"] }
        }),
        step: baseStep
      }),
      await buildCanonicalWorkflowAction({
        state: baseState,
        step: actionStep(tempDir, {
          allowed: false,
          failedRules: [
            {
              ruleId: "VSP007",
              severity: "error",
              message: "Blocked.",
              recommendation: "Recover.",
              evidence: "T001"
            }
          ]
        })
      }),
      await buildCanonicalWorkflowAction({
        state: baseState,
        step: actionStep(tempDir, { nextCommand: "visp context T001" })
      })
    ];

    await writeFile(join(tempDir, ".visp/policy.json"), '{"changed":true}\n', "utf8");
    changedActions.push(
      await buildCanonicalWorkflowAction({ state: projectState(tempDir), step: baseStep })
    );

    for (const changed of changedActions) {
      expect(changed.actionId).not.toBe(base.actionId);
    }

    await writeFile(join(tempDir, ".visp/policy.json"), readFixtures[0].contents, "utf8");
    const normalized = await buildCanonicalWorkflowAction({
      state: projectStateWithTask(tempDir, {
        ...task,
        dependsOn: ["T000"],
        allowedFiles: ["src/notes/sort.ts"],
        expectedFiles: ["tests/notes/sort test.ts"],
        forbiddenFiles: ["package.json"]
      }),
      step: baseStep
    });

    expect(normalized.actionId).toBe(base.actionId);
  });
});
