import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { workflowActionV2Schema } from "../../src/integration/workflow-action.js";
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

    const action = workflowActionV2Schema.parse(JSON.parse(output.join("")));
    expect(action.protocolVersion).toBe("2.0");
    expect(action.phase).toBe("task");
    expect(action.verdict).toBe("ready");
    expect(action.assuranceLevel).toBe("advisory");
    expect(action.requiredReads.every((item) => item.sha256.length === 64)).toBe(true);
    expect(action.nextCommand).toBe("visp context --next");
  });

  it("returns a blocked WorkflowAction when the authoritative next gate blocks", async () => {
    await createPhase8Fixture(tempDir);
    await rm(path.join(tempDir, ".visp", "policy.json"), { force: true });
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--format", "json"]);

    const action = workflowActionV2Schema.parse(JSON.parse(output.join("")));
    expect(process.exitCode).toBe(1);
    expect(action).toMatchObject({
      protocolVersion: "2.0",
      verdict: "blocked",
      nextCommand: "visp policy init --strictness strict"
    });
    expect(action.findings).toEqual(
      expect.arrayContaining([
        "Required read is unavailable: .visp/policy.json.",
        "VSP018: Policy file is missing."
      ])
    );
  });

  it("blocks malformed policy authority in WorkflowAction JSON", async () => {
    await createPhase8Fixture(tempDir);
    await writeFile(path.join(tempDir, ".visp", "policy.json"), "{ malformed policy", "utf8");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--format", "json"]);

    const action = workflowActionV2Schema.parse(JSON.parse(output.join("")));
    expect(action.verdict).toBe("blocked");
    expect(process.exitCode).toBe(1);
    expect(action.findings).toEqual(expect.arrayContaining(["VSP018: Policy validation failed."]));
    expect(action.nextCommand).toBe("visp policy validate");
    expect(action.verdict).not.toBe("ready");
  });

  it("returns an inconclusive WorkflowAction when override evaluation is unavailable", async () => {
    await createPhase8Fixture(tempDir);
    await writeFile(path.join(tempDir, ".visp", "overrides.json"), "{ malformed overrides", "utf8");
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--format", "json"]);

    const rawOutput = output.join("");
    expect(rawOutput.trim()).not.toBe("undefined");
    const action = workflowActionV2Schema.parse(JSON.parse(rawOutput));

    expect(process.exitCode).toBe(1);
    expect(action.verdict).toBe("inconclusive");
    expect(
      action.findings.some(
        (finding) => /override/i.test(finding) && /(unavailable|evaluat)/i.test(finding)
      )
    ).toBe(true);
    expect(action.nextCommand).toBe("visp override validate");
    expect(action.verdict).not.toBe("ready");
  });

  it("returns inconclusive when a required read disappears", async () => {
    await createPhase8Fixture(tempDir);
    const setupProgram = createCli({ writeOut: () => undefined });
    await setupProgram.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);
    const missingPath = ".visp/prompts/current-task.prompt.md";
    await rm(path.join(tempDir, missingPath), { force: true });
    process.exitCode = undefined;
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--format", "json"]);

    const action = workflowActionV2Schema.parse(JSON.parse(output.join("")));
    expect(process.exitCode).toBeUndefined();
    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toEqual([`Required read is unavailable: ${missingPath}.`]);
    expect(action.requiredReads.map((item) => item.path)).not.toContain(missingPath);
    expect(action.nextCommand).toBe("Use .visp/prompts/current-task.prompt.md with your agent");
  });
});
