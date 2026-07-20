import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createWorkflowActionId } from "../../../src/integration/canonical-json.js";
import {
  buildWorkflowActionV2,
  projectWorkflowActionV2,
  workflowActionV2Schema
} from "../../../src/integration/workflow-action.js";
import {
  buildCanonicalWorkflowActionEnvelope,
  canonicalFindingReference
} from "../../../src/integration/canonical-workflow-action.js";
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
const task = {
  ...validTaskGraph.tasks[0]!,
  status: "ready" as const
};
const nextCommand = "Use .visp/prompts/current-task.prompt.md with your agent";

const readFixtures = [
  {
    path: ".visp/policy.json",
    role: "policy",
    contents: '{"strictnessMode":"strict"}\n',
    sha256: "7d7cdad99b364b6656b311c71a7121327df110c75870c8becba1195f1b2887ae"
  },
  {
    path: `${featurePath}/intent.json`,
    role: "intent",
    contents: '{"rawUserRequest":"Pin notes"}\n',
    sha256: "e8ac2d28da6106c167837a6bfd8395657d77ccd00b95fb06cd9e0409e7f4e727"
  },
  {
    path: `${featurePath}/spec.json`,
    role: "specification",
    contents: '{"id":"SPEC-001"}\n',
    sha256: "bdef0655ee0b2db4a7e8e28c4fbaf36fe983848c8649c191ba4ea579c7df7f41"
  },
  {
    path: `${featurePath}/plan.json`,
    role: "plan",
    contents: '{"id":"PLAN-001"}\n',
    sha256: "0cd9d5092fc47a21ff308563242058261b064ffcb74de93fa2705bd608fde9b7"
  },
  {
    path: `${featurePath}/task-graph.json`,
    role: "task-graph",
    contents: '{"featureId":"001"}\n',
    sha256: "d5e9b36056e7d798562eb1e6fa627fb917db59a05fcd05abd23136c30807e3f2"
  },
  {
    path: `${featurePath}/context/T001.context.json`,
    role: "context-pack",
    contents: '{"taskId":"T001"}\n',
    sha256: "7234d46155c030203870d8ea0ef83ebe7cc332349d67be1b705c091198f2a03b"
  },
  {
    path: ".visp/prompts/current-task.prompt.md",
    role: "implementation-prompt",
    contents: "# Task T001\n",
    sha256: "5fdbdc7dc3e92a4ebc772b3dacaf9bf0e14cc53a6d15bfc6e579585fb741daef"
  }
] as const;

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

function projectState(targetPath: string): ProjectState {
  return {
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
    contextPack: {
      ...validContextPack,
      selectedTask: task
    },
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
    nextAllowedCommand: nextCommand,
    allowed: true,
    failedRules: [],
    implementationAllowed: true,
    prAllowed: false,
    ...overrides
  };
}

describe("WorkflowAction 2.0", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "visp-workflow-action-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("locks the complete ready action shape with hash-pinned reads and exact scope", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });

    expect(action).toEqual({
      protocolVersion: "2.0",
      phase: "implement",
      taskId: "T001",
      goal: "Implement pinned-first sorting in the note module.",
      requiredReads: readFixtures.map(({ path, role, sha256 }) => ({ path, role, sha256 })),
      writablePaths: ["src/notes/sort.ts", "tests/notes/sort.test.ts"],
      forbiddenPaths: ["package.json"],
      acceptanceOracles: [
        {
          id: "AC-001",
          expectedBehavior: "Pinned notes are sorted before unpinned notes.",
          validation: "unit"
        }
      ],
      validationCommands: ["pnpm test"],
      assuranceLevel: "kit_strict",
      verdict: "ready",
      findings: [],
      nextCommand
    });
    expect(workflowActionV2Schema.parse(action)).toEqual(action);
    expect(action.assuranceLevel).not.toBe("local_checked");
  });

  it("reports an authoritative blocked action and preserves the exact next command", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        success: false,
        state: "context-needed",
        nextCommand: "visp context T001",
        nextAllowedCommand: "visp context T001",
        reason: "Policy gate selected the next allowed command.",
        blockers: ["VSP007: Implementation requires a context pack."],
        strictnessMode: "locked",
        allowed: false,
        failedRules: [
          {
            ruleId: "VSP007",
            severity: "error",
            message: "Implementation requires a context pack.",
            recommendation: "Generate the selected task context pack.",
            evidence: "context pack missing"
          }
        ],
        implementationAllowed: false
      })
    });

    expect(action).toEqual({
      protocolVersion: "2.0",
      phase: "task",
      taskId: "T001",
      goal: "Implement pinned-first sorting in the note module.",
      requiredReads: readFixtures.map(({ path, role, sha256 }) => ({ path, role, sha256 })),
      writablePaths: [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`],
      forbiddenPaths: ["package.json"],
      acceptanceOracles: [
        {
          id: "AC-001",
          expectedBehavior: "Pinned notes are sorted before unpinned notes.",
          validation: "unit"
        }
      ],
      validationCommands: ["pnpm test"],
      assuranceLevel: "kit_strict",
      verdict: "blocked",
      findings: ["VSP007: Implementation requires a context pack."],
      nextCommand: "visp context T001"
    });
    expect(action.assuranceLevel).not.toBe("local_checked");
  });

  it("marks a missing required read inconclusive instead of ready", async () => {
    const missingPath = ".visp/prompts/current-task.prompt.md";
    await writeReadFixtures(tempDir, new Set([missingPath]));

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, { strictnessMode: "standard" })
    });

    expect(action.requiredReads).toEqual(
      readFixtures
        .filter((fixture) => fixture.path !== missingPath)
        .map(({ path, role, sha256 }) => ({ path, role, sha256 }))
    );
    expect(action).toEqual({
      protocolVersion: "2.0",
      phase: "implement",
      taskId: "T001",
      goal: "Implement pinned-first sorting in the note module.",
      requiredReads: readFixtures
        .filter((fixture) => fixture.path !== missingPath)
        .map(({ path, role, sha256 }) => ({ path, role, sha256 })),
      writablePaths: ["src/notes/sort.ts", "tests/notes/sort.test.ts"],
      forbiddenPaths: ["package.json"],
      acceptanceOracles: [
        {
          id: "AC-001",
          expectedBehavior: "Pinned notes are sorted before unpinned notes.",
          validation: "unit"
        }
      ],
      validationCommands: ["pnpm test"],
      assuranceLevel: "advisory",
      verdict: "inconclusive",
      findings: [`Required read is unavailable: ${missingPath}.`],
      nextCommand
    });
    expect(action.assuranceLevel).not.toBe("local_checked");
  });

  it.each([
    ["relaxed", "advisory"],
    ["standard", "advisory"],
    ["strict", "kit_strict"],
    ["locked", "kit_strict"]
  ] as const)("maps %s strictness to %s assurance without emitting local_checked", async (strictnessMode, assuranceLevel) => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, { strictnessMode })
    });

    expect(action.assuranceLevel).toBe(assuranceLevel);
    expect(action.assuranceLevel).not.toBe("local_checked");
  });

  it.each([
    ["clarify", "clarify"],
    ["spec", "specify"],
    ["plan", "plan"],
    ["tasks", "task"],
    ["context", "task"],
    ["verify", "verify"],
    ["review", "verify"],
    ["reconcile", "verify"],
    ["next", "implement"],
    ["setup", "implement"],
    ["feature", "implement"],
    ["implement", "implement"],
    ["pr", "implement"]
  ] as const)("projects canonical %s to legacy %s", async (canonicalPhase, legacyPhase) => {
    await writeReadFixtures(tempDir);
    const envelope = await buildCanonicalWorkflowActionEnvelope({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });

    const { actionId: _actionId, ...identityInput } = envelope.action;
    const projectedIdentity = { ...identityInput, phase: canonicalPhase };
    const action = projectWorkflowActionV2({
      ...envelope,
      action: {
        ...projectedIdentity,
        actionId: createWorkflowActionId(projectedIdentity)
      }
    });

    expect(action.phase).toBe(legacyPhase);
  });

  it.each([
    ["scan-needed", "implement", []],
    ["constitution-needed", "implement", []],
    [
      "checklist-needed",
      "task",
      [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`]
    ],
    ["verification-failed", "verify", []],
    ["traceability-update-needed", "verify", []]
  ] as const)("uses the frozen canonical phase and scope for legacy %s", async (stateName, phase, writablePaths) => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, { state: stateName })
    });

    expect(action.phase).toBe(phase);
    expect(action.writablePaths).toEqual(writablePaths);
  });

  it("preserves safe legacy path presentation while validating canonical scope", async () => {
    await writeReadFixtures(tempDir);
    const base = projectState(tempDir);
    const presentedTask = {
      ...task,
      allowedFiles: ["src\\z.ts", "src/a file.ts", "src/z.ts", "src\\z.ts"],
      expectedFiles: ["tests\\b.test.ts", "src/a file.ts"],
      forbiddenFiles: ["secrets\\key", "package.json", "secrets/key"]
    };
    const state: ProjectState = {
      ...base,
      selectedTask: presentedTask,
      taskGraph: { ...base.taskGraph!, tasks: [presentedTask] },
      contextPack: { ...base.contextPack!, selectedTask: presentedTask }
    };

    const envelope = await buildCanonicalWorkflowActionEnvelope({
      state,
      step: actionStep(tempDir)
    });
    const action = projectWorkflowActionV2(envelope);

    expect(envelope.action.scope.writablePaths).toEqual([
      "src/a file.ts",
      "src/z.ts",
      "tests/b.test.ts"
    ]);
    expect(action.writablePaths).toEqual([
      "src\\z.ts",
      "src/a file.ts",
      "src/z.ts",
      "tests\\b.test.ts"
    ]);
    expect(action.forbiddenPaths).toEqual(["secrets\\key", "package.json", "secrets/key"]);
  });

  it("projects taskless specification oracles in legacy source order", async () => {
    await writeReadFixtures(tempDir);
    const firstCriterion = {
      ...validRequirement.acceptanceCriteria[0]!,
      id: "AC-010",
      description: "First presented criterion."
    };
    const secondCriterion = {
      ...validRequirement.acceptanceCriteria[0]!,
      id: "AC-002",
      description: "Second presented criterion."
    };
    const state: ProjectState = {
      ...projectState(tempDir),
      selectedTask: undefined,
      taskGraph: undefined,
      contextPack: undefined,
      spec: {
        featureId: "001",
        featureSlug: "note-pinning",
        title: "Add note pinning",
        status: "ready",
        userStories: [],
        requirements: [
          {
            ...validRequirement,
            acceptanceCriteria: [firstCriterion, secondCriterion]
          }
        ],
        acceptanceCriteria: [firstCriterion, secondCriterion],
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
      },
      artifactSummary: {
        ...projectState(tempDir).artifactSummary,
        taskGraph: false,
        context: false
      }
    };

    const envelope = await buildCanonicalWorkflowActionEnvelope({
      state,
      step: actionStep(tempDir, {
        task: null,
        state: "tasks-needed",
        nextCommand: "visp tasks",
        nextAllowedCommand: "visp tasks"
      })
    });
    const action = projectWorkflowActionV2(envelope);

    expect(envelope.action.validationOracles.map((oracle) => oracle.id)).toEqual([
      "AC-002",
      "AC-010"
    ]);
    expect(action).toEqual({
      protocolVersion: "2.0",
      phase: "task",
      taskId: null,
      goal: "Pin notes",
      requiredReads: readFixtures
        .filter(({ role }) => ["policy", "intent", "specification", "plan"].includes(role))
        .map(({ path: readPath, role, sha256 }) => ({ path: readPath, role, sha256 })),
      writablePaths: [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`],
      forbiddenPaths: [],
      acceptanceOracles: [
        {
          id: "AC-010",
          expectedBehavior: "First presented criterion.",
          validation: "unit"
        },
        {
          id: "AC-002",
          expectedBehavior: "Second presented criterion.",
          validation: "unit"
        }
      ],
      validationCommands: [],
      assuranceLevel: "kit_strict",
      verdict: "ready",
      findings: [],
      nextCommand: "visp tasks"
    });
  });

  it("rejects presentation scope that does not match canonical scope", async () => {
    await writeReadFixtures(tempDir);
    const envelope = await buildCanonicalWorkflowActionEnvelope({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });

    expect(() =>
      projectWorkflowActionV2({
        ...envelope,
        v2Presentation: {
          ...envelope.v2Presentation,
          writablePaths: [...envelope.v2Presentation.writablePaths, "src/not-authorized.ts"]
        }
      })
    ).toThrow(/presentation.*scope/i);
  });

  it("rejects tampered oracle, finding, and action identity presentation", async () => {
    await writeReadFixtures(tempDir);
    const envelope = await buildCanonicalWorkflowActionEnvelope({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });

    expect(() =>
      projectWorkflowActionV2({
        ...envelope,
        v2Presentation: { ...envelope.v2Presentation, oracleOrder: [] }
      })
    ).toThrow(/oracle set/i);
    expect(() =>
      projectWorkflowActionV2({
        ...envelope,
        v2Presentation: {
          ...envelope.v2Presentation,
          findingOrder: [`sha256:${"0".repeat(64)}`]
        }
      })
    ).toThrow(/finding set/i);
    expect(() =>
      projectWorkflowActionV2({
        ...envelope,
        action: { ...envelope.action, actionId: `sha256:${"0".repeat(64)}` }
      })
    ).toThrow(/identity is invalid/i);
  });

  it("rejects omitted legacy findings and injected ready-state blockers", async () => {
    const missingPath = ".visp/prompts/current-task.prompt.md";
    await writeReadFixtures(tempDir, new Set([missingPath]));
    const missingEnvelope = await buildCanonicalWorkflowActionEnvelope({
      state: projectState(tempDir),
      step: actionStep(tempDir)
    });

    expect(() =>
      projectWorkflowActionV2({
        ...missingEnvelope,
        v2Presentation: { ...missingEnvelope.v2Presentation, findingOrder: [] }
      })
    ).toThrow(/finding set/i);

    await writeReadFixtures(tempDir);
    const readyEnvelope = await buildCanonicalWorkflowActionEnvelope({
      state: projectState(tempDir),
      step: actionStep(tempDir, { blockers: ["Non-authoritative workflow note."] })
    });
    const blocker = readyEnvelope.action.findings.find(
      (finding) => finding.code === "VISP.WORKFLOW.STATE_BLOCKER"
    )!;
    expect(readyEnvelope.action.verdict).toBe("ready");
    expect(() =>
      projectWorkflowActionV2({
        ...readyEnvelope,
        v2Presentation: {
          ...readyEnvelope.v2Presentation,
          findingOrder: [canonicalFindingReference(blocker)]
        }
      })
    ).toThrow(/finding set/i);
  });

  it("preserves missing-read then blocker order with first-occurrence deduplication", async () => {
    const missingPolicy = ".visp/policy.json";
    const missingPrompt = ".visp/prompts/current-task.prompt.md";
    await writeReadFixtures(tempDir, new Set([missingPolicy, missingPrompt]));
    const policyBlock = "VSP007: Implementation requires a context pack.";

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, {
        success: false,
        allowed: false,
        implementationAllowed: false,
        blockers: [policyBlock, "Later blocker.", policyBlock],
        failedRules: [
          {
            ruleId: "VSP007",
            severity: "error",
            message: "Implementation requires a context pack.",
            recommendation: "Generate the selected task context pack.",
            evidence: "context pack missing"
          }
        ]
      })
    });

    expect(action.verdict).toBe("blocked");
    expect(action.findings).toEqual([
      `Required read is unavailable: ${missingPolicy}.`,
      `Required read is unavailable: ${missingPrompt}.`,
      policyBlock,
      "Later blocker."
    ]);
  });

  it("fails closed when canonical identity contradicts the workflow input", async () => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, { targetPath: join(tempDir, "other") })
    });

    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toContain("Project state and next-step target paths disagree.");
  });

  it.each([
    [
      "task identity",
      { task: { id: "T999", title: "Stale task", status: "ready" } },
      "Project state and next-step task identity disagree."
    ],
    [
      "next command",
      { nextAllowedCommand: "visp context T001" },
      "The evaluated next command disagrees with the authoritative allowed command."
    ],
    [
      "workflow state",
      { state: "future-needed" },
      'Workflow state is not mapped by canonical version 1.0: "future-needed".'
    ]
  ] as const)("projects a %s contradiction as inconclusive", async (_label, overrides, finding) => {
    await writeReadFixtures(tempDir);

    const action = await buildWorkflowActionV2({
      state: projectState(tempDir),
      step: actionStep(tempDir, overrides)
    });

    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toContain(finding);
    expect(action.verdict).not.toBe("ready");
  });

  it("keeps the selected terminal task in a valid next-task projection", async () => {
    await writeReadFixtures(tempDir);
    const base = projectState(tempDir);
    const completedTask = { ...task, status: "done" as const };
    const nextTask = {
      ...task,
      id: "T002",
      title: "Implement the next note task",
      status: "ready" as const,
      dependsOn: ["T001"]
    };
    const state: ProjectState = {
      ...base,
      selectedTask: completedTask,
      taskGraph: { ...base.taskGraph!, tasks: [completedTask, nextTask] },
      contextPack: {
        ...base.contextPack!,
        taskId: "T001",
        selectedTask: completedTask
      }
    };

    const action = await buildWorkflowActionV2({
      state,
      step: actionStep(tempDir, {
        task: { id: nextTask.id, title: nextTask.title, status: nextTask.status },
        state: "next-task-needed",
        nextCommand: "visp context T002",
        nextAllowedCommand: "visp context T002"
      })
    });

    expect(action).toMatchObject({
      phase: "task",
      taskId: "T001",
      goal: completedTask.description,
      writablePaths: [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`],
      validationCommands: ["pnpm test"],
      verdict: "ready",
      findings: [],
      nextCommand: "visp context T002"
    });
    expect(action.requiredReads.map(({ path: readPath }) => readPath)).toContain(
      `${featurePath}/context/T001.context.json`
    );
  });
});
