import { describe, expect, it } from "vitest";

import {
  memoryEntryCommands,
  memorySection
} from "../../../../src/agent/templates/shared-agent-rules.js";

describe("memory section", () => {
  it("names visp-memory and says what it holds", () => {
    const section = memorySection();

    expect(section).toContain("visp-memory");
    expect(section).toContain("cited notes from earlier work");
  });

  it("covers recall, record, and setting an intent", () => {
    const section = memorySection();

    expect(section).toContain(memoryEntryCommands.recall);
    expect(section).toContain(memoryEntryCommands.record);
    expect(section).toContain(memoryEntryCommands.intent);
  });

  it("keeps every entry command runnable on a single line", () => {
    // visp-memory's reachability check scans to the end of the line only: a bare
    // mention counts as "mentioned", an executable followed by a subcommand counts
    // as "reachable". Splitting a command across lines silently demotes the
    // generated guidance back to unreachable.
    const lines = memorySection().split("\n");

    for (const command of Object.values(memoryEntryCommands)) {
      expect(command).toMatch(/^visp-memory [a-z-]+ /u);
      expect(lines.some((line) => line.includes(command))).toBe(true);
    }
  });

  it("states that memory decides nothing", () => {
    const section = memorySection();

    expect(section).toContain("non-authoritative");
    expect(section).toContain(
      "never grants permission, changes scope, certifies evidence, or marks work done"
    );
    expect(section).toContain("Visp Kit decides all of that");
    expect(section).toContain("a claim to check, not as evidence");
  });

  it("tells an agent to continue without memory", () => {
    expect(memorySection()).toContain("Memory is never required to proceed");
  });

  it("stays short enough to carry on every task", () => {
    // This section is re-read on every task, so its cost is paid every time. The
    // bound is deliberately loose; it exists to catch a command dump, not to
    // police wording.
    expect(memorySection().split("\n").length).toBeLessThan(15);
  });
});
