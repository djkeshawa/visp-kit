import { describe, expect, it } from "vitest";

import { selectValidationCommands } from "../../../src/verification/validation-command-selector.js";
import {
  validContextPack,
  validProjectProfile,
  validTaskGraph
} from "../artifacts/fixtures.js";

describe("validation command selector", () => {
  it("uses task commands in targeted mode", () => {
    const selection = selectValidationCommands({
      mode: "targeted",
      task: validTaskGraph.tasks[0],
      contextPack: validContextPack,
      project: validProjectProfile
    });

    expect(selection.commands).toEqual(["pnpm test"]);
  });

  it("falls back to context commands", () => {
    const task = { ...validTaskGraph.tasks[0]!, validationCommands: [] };
    const selection = selectValidationCommands({
      mode: "targeted",
      task,
      contextPack: { ...validContextPack, validationCommands: ["pnpm test"] },
      project: validProjectProfile
    });

    expect(selection.commands).toEqual(["pnpm test"]);
  });

  it("falls back to project test/typecheck commands", () => {
    const task = { ...validTaskGraph.tasks[0]!, validationCommands: [] };
    const selection = selectValidationCommands({
      mode: "targeted",
      task,
      project: validProjectProfile
    });

    expect(selection.commands).toEqual(["pnpm test", "pnpm typecheck"]);
  });

  it("runs all project commands in all mode and deduplicates", () => {
    const selection = selectValidationCommands({
      mode: "all",
      task: { ...validTaskGraph.tasks[0]!, validationCommands: ["pnpm test"] },
      project: {
        ...validProjectProfile,
        lintCommands: ["pnpm lint"],
        buildCommands: ["pnpm build"]
      }
    });

    expect(selection.commands).toEqual([
      "pnpm typecheck",
      "pnpm lint",
      "pnpm test",
      "pnpm build"
    ]);
  });
});
