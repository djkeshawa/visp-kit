import { describe, expect, it } from "vitest";

import { type ContextPack } from "../../../src/artifacts/schemas/context-pack.schema.js";
import { type ImplementMarker } from "../../../src/artifacts/schemas/implement-marker.schema.js";
import { type Task, type TaskGraphArtifact } from "../../../src/artifacts/schemas/task.schema.js";
import {
  checkCodeChangedAfterContext,
  checkEvidencePredatesChange,
  checkMarkerTaskMismatch,
  checkScopePathMissing,
  checkSpecEditedAfterTasks,
  checkStaleContextProvenance,
  runDriftChecks,
  summarizeDriftFindings,
  type CurrentFileState
} from "../../../src/drift/drift-checks.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T001",
    title: "Add note pinning",
    description: "Implement pinning support.",
    requirementIds: [],
    acceptanceCriterionIds: [],
    dependsOn: [],
    allowedFiles: ["src/notes.ts"],
    expectedFiles: [],
    forbiddenFiles: [],
    validationCommands: [],
    status: "in_progress",
    parallelizable: false,
    riskLevel: "low",
    ...overrides
  };
}

function taskGraph(
  tasks: readonly Task[],
  updatedAt = "2026-07-01T00:00:00.000Z"
): TaskGraphArtifact {
  return {
    featureId: "001",
    tasks: [...tasks],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt
  };
}

function pack(overrides: Partial<ContextPack> = {}): ContextPack {
  return {
    id: "CTX-T001",
    featureId: "001",
    featureSlug: "add-note-pinning",
    taskId: "T001",
    budgetMode: "lean",
    estimatedTokens: {
      input: 100,
      expectedOutput: 100,
      total: 200,
      maxInput: 6000,
      mode: "lean",
      estimator: "heuristic-v1"
    },
    overBudget: false,
    recommendation: "Proceed.",
    warnings: [],
    selectedTask: task(),
    includedRequirements: [],
    includedAcceptanceCriteria: [],
    includedPlanDecisions: [],
    includedRisks: [],
    includedDependencyTasks: [],
    includedConstitutionRules: [],
    includedProjectContext: { summary: "", patterns: "", warnings: [] },
    artifactProvenance: [
      {
        label: "spec",
        path: ".visp/features/001-add-note-pinning/spec.json",
        hash: "spec-hash",
        hashAlgorithm: "sha256"
      }
    ],
    includedFiles: [
      {
        path: "src/notes.ts",
        reason: "allowed file",
        includeMode: "snippet",
        hash: "file-hash",
        language: "ts",
        sizeBytes: 100,
        tokenEstimate: 25,
        summaryAvailable: false,
        snippetIncluded: true
      }
    ],
    includedSnippets: [],
    validationCommands: [],
    constraints: [],
    instructions: [],
    createdAt: "2026-06-15T00:00:00.000Z",
    updatedAt: "2026-06-15T00:00:00.000Z",
    ...overrides
  };
}

function files(input: {
  readonly hashes?: Record<string, string>;
  readonly existing?: readonly string[];
}): CurrentFileState {
  const hashes = new Map(Object.entries(input.hashes ?? {}));
  const existing = new Set([...(input.existing ?? []), ...hashes.keys()]);

  return {
    exists: (path) => existing.has(path),
    hash: (path) => hashes.get(path)
  };
}

describe("drift checks", () => {
  it("flags provenance whose current hash differs from the pinned hash", () => {
    const findings = checkStaleContextProvenance(
      pack(),
      files({
        hashes: {
          ".visp/features/001-add-note-pinning/spec.json": "different-hash",
          "src/notes.ts": "file-hash"
        }
      })
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("stale_context_provenance");
    expect(findings[0]?.severity).toBe("error");
  });

  it("passes provenance whose hashes match", () => {
    const findings = checkStaleContextProvenance(
      pack(),
      files({
        hashes: {
          ".visp/features/001-add-note-pinning/spec.json": "spec-hash"
        }
      })
    );

    expect(findings).toHaveLength(0);
  });

  it("flags included files that changed after context compilation", () => {
    const findings = checkCodeChangedAfterContext(
      pack(),
      files({ hashes: { "src/notes.ts": "changed" } })
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("code_changed_after_context");
    expect(findings[0]?.severity).toBe("error");
  });

  it("downgrades changed files to warnings when the task is complete", () => {
    const findings = checkCodeChangedAfterContext(
      pack({ selectedTask: task({ status: "done" }) }),
      files({ hashes: { "src/notes.ts": "changed" } })
    );

    expect(findings[0]?.severity).toBe("warning");
  });

  it("skips new-file entries with no baseline", () => {
    const findings = checkCodeChangedAfterContext(
      pack({
        includedFiles: [
          {
            path: "src/new-module.ts",
            reason: "expected file",
            includeMode: "new-file",
            hash: "new-file",
            language: "ts",
            sizeBytes: 0,
            tokenEstimate: 0,
            summaryAvailable: false,
            snippetIncluded: false
          }
        ]
      }),
      files({ hashes: { "src/new-module.ts": "anything" } })
    );

    expect(findings).toHaveLength(0);
  });

  it("flags missing allowed files as errors while the task is open", () => {
    const findings = checkScopePathMissing(taskGraph([task()]), files({}));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("scope_path_missing");
    expect(findings[0]?.severity).toBe("error");
  });

  it("flags missing expected files only for completed tasks", () => {
    const open = checkScopePathMissing(
      taskGraph([task({ expectedFiles: ["src/pinning.ts"], allowedFiles: [] })]),
      files({})
    );
    const done = checkScopePathMissing(
      taskGraph([task({ status: "done", expectedFiles: ["src/pinning.ts"], allowedFiles: [] })]),
      files({})
    );

    expect(open).toHaveLength(0);
    expect(done).toHaveLength(1);
    expect(done[0]?.severity).toBe("error");
  });

  it("flags spec updated after the task graph", () => {
    const findings = checkSpecEditedAfterTasks({
      spec: {
        featureId: "001",
        featureSlug: "add-note-pinning",
        title: "Spec",
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
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-07-02T00:00:00.000Z"
      },
      taskGraph: taskGraph([task()], "2026-07-01T00:00:00.000Z")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("spec_edited_after_tasks");
  });

  it("flags implement markers whose scope no longer matches the task", () => {
    const marker: ImplementMarker = {
      version: "1.0",
      taskId: "T001",
      featureId: "001",
      strictnessMode: "strict",
      allowedFiles: ["src/old-path.ts"],
      expectedFiles: [],
      forbiddenFiles: [],
      createdAt: "2026-06-20T00:00:00.000Z"
    };

    const findings = checkMarkerTaskMismatch({
      marker,
      taskGraph: taskGraph([task()])
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("marker_task_mismatch");
    expect(findings[0]?.severity).toBe("error");
  });

  it("flags verification evidence that predates the task graph", () => {
    const findings = checkEvidencePredatesChange({
      verification: {
        taskId: "T001",
        endedAt: "2026-06-30T00:00:00.000Z"
      } as never,
      taskGraph: taskGraph([task()], "2026-07-01T00:00:00.000Z")
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]?.kind).toBe("evidence_predates_change");
  });

  it("assigns sequential DRF ids and summarizes by kind", () => {
    const findings = runDriftChecks({
      taskGraph: taskGraph([task()]),
      contextPacks: [pack()],
      testMapPaths: ["tests/gone.test.ts"],
      files: files({ hashes: { "src/notes.ts": "changed" } })
    });

    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0]?.id).toBe("DRF-001");
    expect(new Set(findings.map((finding) => finding.id)).size).toBe(findings.length);

    const summary = summarizeDriftFindings(findings);

    expect(summary.mapped_test_missing).toBe(1);
  });
});
