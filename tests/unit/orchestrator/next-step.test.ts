import { describe, expect, it } from "vitest";

import { recommendNextStep } from "../../../src/orchestrator/next-step.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import { validProjectConfig, validProjectProfile, validTaskGraph } from "../artifacts/fixtures.js";

function state(overrides: Partial<ProjectState>): ProjectState {
  return {
    targetPath: "/workspace",
    initialized: true,
    config: validProjectConfig,
    profile: validProjectProfile,
    selectedFeature: {
      id: "001",
      slug: "add-note-pinning",
      key: "001-add-note-pinning",
      relativePath: ".visp/features/001-add-note-pinning"
    },
    selectedTask: validTaskGraph.tasks[0],
    taskGraph: validTaskGraph,
    artifactSummary: {
      clarifications: true,
      spec: true,
      plan: true,
      taskGraph: true,
      traceability: true,
      context: false,
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
      branch: "main",
      stagedCount: 0,
      unstagedCount: 0,
      changedFiles: [],
      warnings: []
    },
    warnings: [],
    errors: [],
    ...overrides
  };
}

describe("next-step resolver", () => {
  it("recommends init when .visp is missing", () => {
    const next = recommendNextStep({
      state: state({ initialized: false, selectedFeature: undefined, selectedTask: undefined })
    });

    expect(next.nextCommand).toBe("visp-kit init");
  });

  it("recommends scan when scan cache is missing", () => {
    const next = recommendNextStep({ state: state({ scanned: false }) });

    expect(next.nextCommand).toBe("visp-kit scan");
  });

  it("recommends feature when no active feature exists", () => {
    const next = recommendNextStep({
      state: state({ selectedFeature: undefined, selectedTask: undefined })
    });

    expect(next.nextCommand).toContain("visp-kit feature");
  });

  it("recommends context before implementation", () => {
    const next = recommendNextStep({ state: state({}) });

    expect(next.nextCommand).toBe("visp-kit context --next");
  });

  // The exact state of a fresh project after `visp setup`: the toolchain's own
  // root files (.mcp.json, AGENTS.md) and its .gitignore entry are uncommitted,
  // and nothing has been implemented. This used to read as "source changes
  // detected" — the implement phase was skipped and `visp work` refused.
  it("still recommends implementation when only setup artifacts changed", () => {
    const next = recommendNextStep({
      state: state({
        artifactSummary: {
          ...state({}).artifactSummary,
          context: true
        },
        git: {
          ...state({}).git,
          changedFiles: [".mcp.json", "AGENTS.md", "visp-memory.yaml", ".gitignore"],
          unstagedCount: 4
        }
      })
    });

    expect(next.reason).toContain("no source changes were detected");
  });

  it("recommends verify when context exists and source changed", () => {
    const next = recommendNextStep({
      state: state({
        artifactSummary: {
          ...state({}).artifactSummary,
          context: true
        },
        git: {
          ...state({}).git,
          changedFiles: ["src/notes.ts"],
          unstagedCount: 1
        }
      })
    });

    expect(next.nextCommand).toBe("visp-kit verify --task T001");
  });
});
