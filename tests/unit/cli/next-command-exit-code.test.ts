import { afterEach, describe, expect, it } from "vitest";

import { createNextCommand } from "../../../src/cli/commands/next.command.js";
import { ok } from "../../../src/core/result.js";
import { type NextWorkflowResult } from "../../../src/workflows/next.workflow.js";

afterEach(() => {
  process.exitCode = undefined;
});

async function runNextCommand(
  summary: Partial<NextWorkflowResult> & { success: boolean },
  argv: readonly string[]
): Promise<number | undefined> {
  process.exitCode = undefined;
  const command = createNextCommand({
    runNext: async () => ok(summary as NextWorkflowResult),
    writeOut: () => undefined,
    writeErr: () => undefined
  });
  command.exitOverride();
  await command.parseAsync(["node", "next", ...argv]);
  return process.exitCode as number | undefined;
}

// Observed live, one command apart:
//
//   $ visp-kit next --format json --protocol 3.4   # exit 1, verdict "ready"
//
// The frame said ready; the exit code said blocked. Hyper compares the two
// channels and correctly refused to proceed on the contradiction
// (workflow_action_contradiction), which turned a passing checkpoint into an
// INCONCLUSIVE stop. The exit code must follow the surface that was printed.
describe("next --format json exits by the verdict it printed", () => {
  it("exits 0 when the printed action says ready, whatever the summary says", async () => {
    const exitCode = await runNextCommand(
      {
        success: false,
        action: { verdict: "ready" } as NextWorkflowResult["action"]
      },
      ["--format", "json"]
    );

    expect(exitCode).toBeUndefined();
  });

  it("exits 1 when the printed action says blocked", async () => {
    const exitCode = await runNextCommand(
      {
        success: true,
        action: { verdict: "blocked" } as NextWorkflowResult["action"]
      },
      ["--format", "json"]
    );

    expect(exitCode).toBe(1);
  });

  it("keeps summary semantics for the plain --json surface", async () => {
    const exitCode = await runNextCommand({ success: false }, ["--json"]);

    expect(exitCode).toBe(1);
  });
});
