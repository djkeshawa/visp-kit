import { describe, expect, it } from "vitest";

import { sourceChangedFiles } from "../../../src/gates/artifact-presence.js";
import { type ProjectState } from "../../../src/orchestrator/project-state.js";

function stateWithChanges(changedFiles: readonly string[]): ProjectState {
  return {
    git: { changedFiles }
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
