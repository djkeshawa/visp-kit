import { describe, expect, it } from "vitest";

import {
  classifyValidationCommand,
  partitionValidationCommands,
  rejectedCommandMessages
} from "../../../src/verification/command-classifier.js";

describe("classifyValidationCommand", () => {
  // The head-to-head run's actual failure: an agent filled a task template's
  // `validationCommand: "TBD"` with the manual check it meant, Kit handed the
  // sentence to /bin/sh, and the resulting "Manually: not found" was recorded
  // as a FAILING TEST. Three of that run's four verify failures were this.
  it.each([
    "Manually open index.html and check the snake wraps at the screen edge",
    "Open the game in a browser and play for ten seconds",
    "Verify that the board does not clear itself",
    "Run all tests",
    "Confirm the score increments"
  ])("classifies %j as prose and never as something to execute", (entry) => {
    const classified = classifyValidationCommand(entry);

    expect(classified.kind).toBe("prose");
    expect(classified.reason).toMatch(/sentence/u);
  });

  // The asymmetry that matters: a real command wrongly called prose would
  // SUPPRESS a check that would have run, which is the failure this module
  // exists to prevent. Every one of these must stay runnable.
  it.each([
    "pnpm test",
    "npm run test:unit",
    "pnpm vitest run tests/unit/notes/sort.test.ts",
    "make test",
    "just check",
    "go test ./...",
    "cargo test --all-features",
    "./scripts/verify.sh",
    "python3 -m pytest",
    "Rscript analysis.R",
    "Xvfb -screen 0 1280x1024x24",
    "node dist/index.js --help",
    "mytool run specs",
    "npm test && npm run lint",
    "biome check .",
    "tsc"
  ])("keeps %j executable", (entry) => {
    expect(classifyValidationCommand(entry).kind).toBe("executable");
  });

  it.each([
    "TBD",
    "TODO",
    "<add a validation command>",
    "   "
  ])("classifies %j as a placeholder rather than prose", (entry) => {
    const classified = classifyValidationCommand(entry);

    expect(classified.kind).toBe("placeholder");
    expect(classified.reason).toMatch(/placeholder/u);
  });

  it("partitions a mixed list and explains every rejection", () => {
    const partition = partitionValidationCommands([
      "pnpm test",
      "TBD",
      "Manually open the page and look at it",
      "   ",
      "pnpm typecheck"
    ]);

    expect(partition.executable).toEqual(["pnpm test", "pnpm typecheck"]);
    expect(partition.rejected.map((entry) => entry.kind)).toEqual(["placeholder", "prose"]);
    expect(partition.rejected.every((entry) => (entry.reason ?? "").length > 0)).toBe(true);
  });

  it("tells the reader what to do instead of what broke", () => {
    const messages = rejectedCommandMessages(
      partitionValidationCommands(["Manually check the wrap behaviour"]).rejected
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("was not executed");
    expect(messages[0]).toContain("Replace it with a command a shell can run");
    // The old behavior's message — a shell error about a missing program —
    // sent the reader to debug their test suite instead of their task graph.
    expect(messages[0]).not.toContain("not found");
  });
});
