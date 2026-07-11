import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

describe("visp next command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-next-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
  });

  it("recommends init when .visp is missing", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir]);

    expect(output.join("")).toContain("visp init");
  });

  it("recommends scan after initialization", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--explain"]);

    expect(output.join("")).toContain("visp scan");
    expect(output.join("")).toContain("Reason:");
  });

  it("prints only the command when requested", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--command-only"]);

    expect(output.join("")).toBe("visp context --next\n");
  });

  it("returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync(["node", "visp", "next", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      nextCommand: string;
      strictnessMode: string;
      implementationAllowed: boolean;
      blockedCommands: Array<{ command: string; ruleId: string }>;
    };

    expect(errors.join("")).toBe("");
    expect(summary.success).toBe(true);
    expect(summary.nextCommand).toBe("visp context --next");
    expect(summary.strictnessMode).toBe("standard");
    expect(summary.implementationAllowed).toBe(false);
    expect(summary.blockedCommands.some((item) => item.ruleId === "VSP007")).toBe(true);
  });

  it("returns the compact WorkflowActionV2 contract with --format json", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--format", "json"]);

    const action = JSON.parse(output.join("")) as {
      protocolVersion: string;
      phase: string;
      verdict: string;
      assuranceLevel: string;
      requiredReads: Array<{ path: string; sha256: string }>;
      nextCommand: string;
    };
    expect(action.protocolVersion).toBe("2.0");
    expect(action.phase).toBe("task");
    expect(action.verdict).toBe("ready");
    expect(action.assuranceLevel).toBe("advisory");
    expect(action.requiredReads.every((item) => item.sha256.length === 64)).toBe(true);
    expect(action.nextCommand).toBe("visp context --next");
  });
});
