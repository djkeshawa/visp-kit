import { describe, expect, it } from "vitest";

import { specReadiness } from "../../../src/gates/artifact-readiness.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";

function stateWith(input: {
  readonly spec?: unknown;
  readonly errors?: readonly string[];
  readonly warnings?: readonly string[];
}): ProjectState {
  return {
    spec: input.spec,
    errors: input.errors ?? [],
    warnings: input.warnings ?? []
  } as unknown as ProjectState;
}

// Reproduced by a hostile-QA run: truncate spec.json to invalid JSON, run
// `visp plan`. Readiness called the file MISSING, so `next` answered with the
// GENERATE command, which validated a freshly seeded draft and reported that
// draft's all-TBD placeholder errors — phantom complaints about content the
// user's file never held — while `visp-kit status`, at the same moment,
// correctly said "spec is unreadable: Invalid JSON…". Two surfaces, two
// stories, and the true one was in the wrong place.
describe("an unparseable artifact is incomplete, not missing", () => {
  it("reports the recorded parse error instead of sending next to generate", () => {
    const readiness = specReadiness(
      stateWith({
        spec: undefined,
        errors: ["spec is unreadable: Invalid JSON in spec.json: Unterminated string"]
      })
    );

    expect(readiness.state).toBe("incomplete");
    if (readiness.state === "incomplete") {
      expect(readiness.errors.join(" ")).toContain("spec is unreadable");
      expect(readiness.errors.join(" ")).toContain("Repair or restore");
    }
  });

  it("catches the parse failure on the warnings channel too", () => {
    // Workflow artifacts record their unreadable message as a warning; core
    // artifacts record theirs as an error. Both mean the same thing here.
    const readiness = specReadiness(
      stateWith({
        spec: undefined,
        warnings: ["spec is unreadable: Invalid JSON in spec.json: Expected ','"]
      })
    );

    expect(readiness.state).toBe("incomplete");
  });

  it("still reports a genuinely absent artifact as missing", () => {
    expect(specReadiness(stateWith({ spec: undefined })).state).toBe("missing");
  });

  it("does not mistake another artifact's parse error for this one", () => {
    const readiness = specReadiness(
      stateWith({
        spec: undefined,
        errors: ["plan is unreadable: Invalid JSON in plan.json"]
      })
    );

    expect(readiness.state).toBe("missing");
  });
});
