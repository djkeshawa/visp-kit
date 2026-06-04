import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

describe("visp next command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-next-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
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
});
