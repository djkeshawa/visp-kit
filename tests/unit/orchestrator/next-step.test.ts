import { describe, expect, it } from "vitest";

import { recommendNextStep } from "../../../src/orchestrator/next-step.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import {
  validProjectConfig,
  validProjectProfile,
  validTaskGraph
} from "../artifacts/fixtures.js";

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

    expect(next.nextCommand).toBe("visp init");
  });

  it("recommends scan when scan cache is missing", () => {
    const next = recommendNextStep({ state: state({ scanned: false }) });

    expect(next.nextCommand).toBe("visp scan");
  });

  it("recommends feature when no active feature exists", () => {
    const next = recommendNextStep({
      state: state({ selectedFeature: undefined, selectedTask: undefined })
    });

    expect(next.nextCommand).toContain("visp feature");
  });

  it("recommends context before implementation", () => {
    const next = recommendNextStep({ state: state({}) });

    expect(next.nextCommand).toBe("visp context --next");
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

    expect(next.nextCommand).toBe("visp verify --task T001");
  });
});
