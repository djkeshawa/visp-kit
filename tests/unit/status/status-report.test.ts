import { describe, expect, it } from "vitest";

import { renderStatusMarkdown } from "../../../src/status/status-report.js";
import { recommendNextStep } from "../../../src/orchestrator/next-step.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";
import {
  validProjectConfig,
  validProjectProfile,
  validTaskGraph
} from "../artifacts/fixtures.js";

describe("status report renderer", () => {
  it("includes active feature and next command", () => {
    const state: ProjectState = {
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
      errors: []
    };
    const markdown = renderStatusMarkdown({
      state,
      next: recommendNextStep({ state })
    });

    expect(markdown).toContain("001-add-note-pinning");
    expect(markdown).toContain("visp context");
  });
});
