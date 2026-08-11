// Shared fixture for workflow-action tests: a minimal ready-to-implement
// project state with hash-pinned reads. Extracted from workflow-action.test.ts
// for reuse by hash-projection.test.ts (P10-US-01).

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { type NextStep } from "../../../src/orchestrator/next-step.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import { validContextPack, validFeature, validTaskGraph } from "../artifacts/fixtures.js";

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

export async function writeReadFixtures(
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

export function projectState(targetPath: string): ProjectState {
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
      changedSinceBase: [],
      warnings: []
    },
    warnings: [],
    errors: []
  };
}

export function actionStep(targetPath: string, overrides: Partial<NextStep> = {}): NextStep {
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
