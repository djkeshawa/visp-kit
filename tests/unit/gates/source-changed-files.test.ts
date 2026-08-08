import { describe, expect, it } from "vitest";

import { sourceChangedFiles } from "../../../src/gates/artifact-presence.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";

function stateWithChanges(changedFiles: readonly string[]): ProjectState {
  return {
    git: { changedFiles, changedSinceBase: [] }
  } as unknown as ProjectState;
}

describe("sourceChangedFiles answers 'did the user change the codebase?'", () => {
  // On a fresh project, `visp setup` writes .mcp.json, AGENTS.md, and a
  // .gitignore entry. Before any implementation happened, `next` saw those
  // uncommitted files, decided the task had already been implemented, and
  // reported verify-needed — so `visp work` refused to start the very
  // implementation the workflow had just authorized.
  it("does not count the files the toolchain itself writes during setup", () => {
    expect(
      sourceChangedFiles(
        stateWithChanges([
          ".mcp.json",
          "AGENTS.md",
          "visp-memory.yaml",
          "visp-hyper-instructions.md"
        ])
      )
    ).toEqual([]);
  });

  it("still counts real source files", () => {
    expect(sourceChangedFiles(stateWithChanges(["src/store.js", ".mcp.json"]))).toEqual([
      "src/store.js"
    ]);
  });

  it("still counts the user's own .gitignore edit", () => {
    expect(sourceChangedFiles(stateWithChanges([".gitignore"]))).toEqual([".gitignore"]);
  });

  it("keeps ordinary .visp workflow artifacts out of the count", () => {
    expect(
      sourceChangedFiles(
        stateWithChanges([".visp/features/001-x/spec.json", ".visp/status.json"])
      )
    ).toEqual([]);
  });

  // The blanket `.visp/` strip hid planted files in the two security zones
  // from every gate that uses this function. A file in .visp/state/ that Visp
  // did not write is a forgery and must stay visible.
  it("surfaces a forged file planted in a security zone", () => {
    expect(
      sourceChangedFiles(stateWithChanges([".visp/state/implement-allowed/../escape.json"]))
    ).toEqual([".visp/state/implement-allowed/../escape.json"]);
    expect(
      sourceChangedFiles(stateWithChanges([".visp/features/001-x/assurance/T001/planted.txt"]))
    ).toEqual([".visp/features/001-x/assurance/T001/planted.txt"]);
  });
});

// Round-4 evaluation: weak models reliably implement and COMMIT before
// running the evidence loop. Without the base union, verify then saw a clean
// tree ("No source changes were detected"), every save failed, and no task
// ever closed through the verbs.
describe("committed work still counts as the task's changes", () => {
  it("unions the working tree with commits since the task's base", () => {
    const state = {
      git: {
        changedFiles: ["src/wip.js"],
        changedSinceBase: ["src/store.js", "tests/store.test.js", ".visp/status.json"]
      }
    } as unknown as Parameters<typeof sourceChangedFiles>[0];

    expect(sourceChangedFiles(state)).toEqual([
      "src/wip.js",
      "src/store.js",
      "tests/store.test.js"
    ]);
  });
});
