import { describe, expect, it } from "vitest";

import { buildPrArtifact } from "../../../src/pr/pr-summary.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";

function stateWith(input: {
  readonly checklistStatus: "done" | "pending";
  readonly reviewWarnings: readonly string[];
}): ProjectState {
  return {
    selectedFeature: { id: "001", slug: "demo", key: "001-demo", relativePath: "x" },
    selectedTask: undefined,
    spec: undefined,
    traceability: undefined,
    taskGraph: { tasks: [] },
    review: { warnings: input.reviewWarnings },
    reconcile: undefined,
    verification: undefined,
    implementationChecklist: {
      items: [
        {
          id: "read-context",
          label: "x",
          status: input.checklistStatus,
          required: true
        }
      ]
    },
    actualUsage: { status: "unavailable" }
  } as unknown as ProjectState;
}

// Found by a hostile-QA run inside ONE generated pr.md: the evidence section
// said "Implementation Checklist … Status: complete / Pending required: none"
// while the Warnings section of the same file said "Implementation checklist:
// 7 pending required…". The review report snapshots that line at review time;
// attestation happens at `visp save` afterwards. The live state wins.
describe("the PR artifact does not contradict itself about the checklist", () => {
  const staleLine =
    "Implementation checklist: 7 pending required, 0 blocked required, usage pending.";

  it("drops the stale review snapshot when the live checklist is complete", () => {
    const pr = buildPrArtifact({
      state: stateWith({ checklistStatus: "done", reviewWarnings: [staleLine] }),
      title: "Demo",
      changedFiles: [],
      warnings: [],
      generatedAt: "2026-08-08T00:00:00.000Z"
    });

    expect(pr.warnings.join(" ")).not.toContain("pending required");
  });

  it("keeps the line when required items genuinely are pending", () => {
    const pr = buildPrArtifact({
      state: stateWith({ checklistStatus: "pending", reviewWarnings: [staleLine] }),
      title: "Demo",
      changedFiles: [],
      warnings: [],
      generatedAt: "2026-08-08T00:00:00.000Z"
    });

    expect(pr.warnings.join(" ")).toContain("7 pending required");
  });

  it("keeps unrelated review warnings either way", () => {
    const pr = buildPrArtifact({
      state: stateWith({
        checklistStatus: "done",
        reviewWarnings: ["Behavior changed without test updates."]
      }),
      title: "Demo",
      changedFiles: [],
      warnings: [],
      generatedAt: "2026-08-08T00:00:00.000Z"
    });

    expect(pr.warnings.join(" ")).toContain("Behavior changed without test updates.");
  });
});
