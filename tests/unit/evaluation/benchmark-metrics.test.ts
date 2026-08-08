import { describe, expect, it } from "vitest";

import { computeBenchmarkMetrics } from "../../../src/evaluation/benchmark-metrics.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";

function state(overrides: Partial<ProjectState> = {}): ProjectState {
  return {
    targetPath: "/repo",
    initialized: true,
    artifactSummary: {
      clarifications: true,
      spec: true,
      plan: true,
      taskGraph: true,
      traceability: false,
      context: true,
      verification: false,
      review: false,
      reconcile: false,
      pr: false
    },
    taskSummary: {
      total: 1,
      ready: 0,
      pending: 0,
      inProgress: 1,
      blocked: 0,
      done: 0,
      verified: 0
    },
    scanned: true,
    constitution: true,
    scanCacheFiles: {},
    git: {
      isRepo: false,
      branch: null,
      stagedCount: 0,
      unstagedCount: 0,
      changedFiles: [],
      changedSinceBase: [],
      warnings: []
    },
    warnings: [],
    errors: [],
    spec: {} as never,
    plan: {} as never,
    taskGraph: {} as never,
    contextPack: {} as never,
    ...overrides
  };
}

describe("benchmark metrics", () => {
  it("computes context reduction against the whole-repo baseline", () => {
    const metrics = computeBenchmarkMetrics({
      state: state(),
      contextTokenTotals: [1000, 3000],
      fileIndexSizeBytes: [200_000, 200_000],
      drift: null
    });

    expect(metrics.contextEfficiency.measuredTaskCount).toBe(2);
    expect(metrics.contextEfficiency.averageContextTokens).toBe(2000);
    expect(metrics.contextEfficiency.wholeRepoTokenBaseline).toBe(100_000);
    expect(metrics.contextEfficiency.reductionRatio).toBeCloseTo(0.98, 2);
  });

  it("returns null reduction when there is no baseline or no packs", () => {
    const noBaseline = computeBenchmarkMetrics({
      state: state(),
      contextTokenTotals: [1000],
      fileIndexSizeBytes: [],
      drift: null
    });
    const noPacks = computeBenchmarkMetrics({
      state: state(),
      contextTokenTotals: [],
      fileIndexSizeBytes: [4000],
      drift: null
    });

    expect(noBaseline.contextEfficiency.reductionRatio).toBeNull();
    expect(noPacks.contextEfficiency.reductionRatio).toBeNull();
  });

  it("measures evidence completeness from the artifact summary", () => {
    const metrics = computeBenchmarkMetrics({
      state: state(),
      contextTokenTotals: [],
      fileIndexSizeBytes: [],
      drift: null
    });

    expect(metrics.evidenceCompleteness.presentArtifacts).toBe(5);
    expect(metrics.evidenceCompleteness.expectedArtifacts).toBe(10);
    expect(metrics.evidenceCompleteness.ratio).toBeCloseTo(0.5, 5);
  });

  it("counts present-but-unparsed artifacts against the validation rate", () => {
    const metrics = computeBenchmarkMetrics({
      state: state({ spec: undefined }),
      contextTokenTotals: [],
      fileIndexSizeBytes: [],
      drift: null
    });

    expect(metrics.artifactValidation.presentArtifacts).toBe(4);
    expect(metrics.artifactValidation.parsedArtifacts).toBe(3);
    expect(metrics.artifactValidation.ratio).toBeCloseTo(0.75, 5);
  });

  it("passes drift counts through", () => {
    const metrics = computeBenchmarkMetrics({
      state: state(),
      contextTokenTotals: [],
      fileIndexSizeBytes: [],
      drift: { errors: 2, warnings: 1 }
    });

    expect(metrics.drift).toEqual({ errors: 2, warnings: 1 });
  });
});
