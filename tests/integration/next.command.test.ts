import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import {
  type WorkflowActionV2,
  workflowActionV2Schema
} from "../../src/integration/workflow-action.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

function expectExactWorkflowActionJson(
  rawOutput: string,
  expected: WorkflowActionV2
): WorkflowActionV2 {
  const action = workflowActionV2Schema.parse(JSON.parse(rawOutput));
  expect(action).toEqual(expected);
  expect(rawOutput).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  return action;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

async function expectedPhase8Action(
  targetPath: string,
  overrides: Partial<WorkflowActionV2> = {}
): Promise<WorkflowActionV2> {
  const featurePath = ".visp/features/001-add-note-pinning";
  const readDefinitions = [
    { path: ".visp/policy.json", role: "policy" },
    { path: `${featurePath}/intent.json`, role: "intent" },
    { path: `${featurePath}/spec.json`, role: "specification" },
    { path: `${featurePath}/plan.json`, role: "plan" },
    { path: `${featurePath}/task-graph.json`, role: "task-graph" }
  ].filter(
    ({ path: readPath }) => readPath !== ".visp/policy.json" || overrides.verdict !== "blocked"
  );
  const requiredReads = await Promise.all(
    readDefinitions.map(async ({ path: readPath, role }) => ({
      path: readPath,
      role,
      sha256: await sha256File(path.join(targetPath, readPath))
    }))
  );

  return {
    protocolVersion: "2.0",
    phase: "task",
    taskId: "T001",
    goal: "Update the note helper and test coverage for pinning.",
    requiredReads,
    writablePaths: [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`],
    forbiddenPaths: [
      "Dependency manifests and lockfiles unless dependency approval is part of this task"
    ],
    acceptanceOracles: [
      {
        id: "AC001",
        expectedBehavior:
          "Pinning a note places it before unpinned notes and unpinning restores ordinary ordering.",
        validation: "unit"
      }
    ],
    validationCommands: ["pnpm test"],
    assuranceLevel: "advisory",
    verdict: "ready",
    findings: [],
    nextCommand: "visp context --next",
    ...overrides
  };
}

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

    const action = expectExactWorkflowActionJson(
      output.join(""),
      await expectedPhase8Action(tempDir)
    );
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

    const findings = [
      "Required read is unavailable: .visp/policy.json.",
      "VSP018: Policy file is missing.",
      "VSP007: Implementation requires a context pack.",
      "VSP020: Implementation checklist evidence is missing."
    ];
    const action = expectExactWorkflowActionJson(
      output.join(""),
      await expectedPhase8Action(tempDir, {
        verdict: "blocked",
        findings,
        nextCommand: "visp policy init --strictness strict"
      })
    );
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
    const finding = `Override or gate evaluation is unavailable: Invalid JSON in ${path.join(
      tempDir,
      ".visp",
      "overrides.json"
    )}: Expected property name or '}' in JSON at position 2 (line 1 column 3)`;
    const action = expectExactWorkflowActionJson(
      rawOutput,
      await expectedPhase8Action(tempDir, {
        verdict: "inconclusive",
        findings: [finding],
        nextCommand: "visp override validate"
      })
    );

    expect(process.exitCode).toBe(1);
    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toHaveLength(1);
    expect(action.findings[0]).toMatch(/^Override or gate evaluation is unavailable:/u);
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
