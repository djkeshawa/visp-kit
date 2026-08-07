import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { type CanonicalWorkflowActionIdentityInput } from "../../src/integration/canonical-workflow-action.js";
import {
  type WorkflowActionV2,
  type WorkflowActionV3,
  type WorkflowActionV31,
  workflowActionV2Schema,
  workflowActionV3Schema,
  workflowActionV31Schema
} from "../../src/integration/workflow-action.js";
import { createWorkflowActionIdV1_1 } from "../../src/integration/canonical-json.js";
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

function expectExactWorkflowActionV3Json(
  rawOutput: string,
  expected: WorkflowActionV3
): WorkflowActionV3 {
  const action = workflowActionV3Schema.parse(JSON.parse(rawOutput));
  expect(action).toEqual(expected);
  expect(rawOutput).toBe(`${JSON.stringify(expected, null, 2)}\n`);
  return action;
}

function expectExactWorkflowActionV31Json(rawOutput: string): WorkflowActionV31 {
  const action = workflowActionV31Schema.parse(JSON.parse(rawOutput));
  expect(rawOutput).toBe(`${JSON.stringify(action, null, 2)}\n`);
  return action;
}

async function sha256File(filePath: string): Promise<string> {
  return createHash("sha256")
    .update(await readFile(filePath))
    .digest("hex");
}

const expectedWorkflowActionIdentityDomain = "visp.workflow-action\0canonical-1.0\0";

function expectedCanonicalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Expected a finite canonical number.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(expectedCanonicalJson).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort((left, right) =>
      left < right ? -1 : left > right ? 1 : 0
    );
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${expectedCanonicalJson(record[key])}`)
      .join(",")}}`;
  }
  throw new TypeError(`Unsupported expected canonical value: ${typeof value}`);
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
    nextCommand: "visp-kit context --next",
    ...overrides
  };
}

type Phase8V3Scenario = "ready" | "blocked" | "inconclusive";

function expectedPhase8Findings(
  scenario: Phase8V3Scenario,
  nextCommand: string,
  inconclusiveFinding?: string
): WorkflowActionV3["findings"] {
  const workflowFinding = (
    code: "VISP.WORKFLOW.STATE_BLOCKER" | "VISP.WORKFLOW.WARNING",
    message: string
  ): WorkflowActionV3["findings"][number] => ({
    code,
    source: "workflow",
    severity: "warning",
    effect: "none",
    message,
    recommendation: nextCommand,
    evidence: [message]
  });

  if (scenario === "ready") {
    return [
      workflowFinding(
        "VISP.WORKFLOW.STATE_BLOCKER",
        "VSP007: Implementation requires a context pack."
      ),
      workflowFinding(
        "VISP.WORKFLOW.STATE_BLOCKER",
        "VSP020: Implementation checklist evidence is missing."
      ),
      workflowFinding("VISP.WORKFLOW.WARNING", "Git repository unavailable."),
      {
        code: "VSP007",
        source: "policy",
        severity: "error",
        effect: "none",
        message: "Implementation requires a context pack.",
        recommendation: "Run visp-kit context --next.",
        evidence: ["Task context JSON was not found."]
      },
      {
        code: "VSP020",
        source: "policy",
        severity: "error",
        effect: "none",
        message: "Implementation checklist evidence is missing.",
        recommendation: "Run visp-kit context T001.",
        evidence: [
          ".visp/features/<feature>/context/T001.implementation-checklist.json was not found."
        ]
      }
    ];
  }

  if (scenario === "blocked") {
    return [
      {
        code: "VISP.FRESHNESS.REQUIRED_READ_UNAVAILABLE",
        source: "freshness",
        severity: "error",
        effect: "uncertain",
        message: "Required read is unavailable: .visp/policy.json.",
        recommendation: "Restore or regenerate the required read before using this action.",
        evidence: [".visp/policy.json"]
      },
      workflowFinding(
        "VISP.WORKFLOW.STATE_BLOCKER",
        "VSP007: Implementation requires a context pack."
      ),
      workflowFinding("VISP.WORKFLOW.STATE_BLOCKER", "VSP018: Policy file is missing."),
      workflowFinding(
        "VISP.WORKFLOW.STATE_BLOCKER",
        "VSP020: Implementation checklist evidence is missing."
      ),
      workflowFinding("VISP.WORKFLOW.WARNING", "Git repository unavailable."),
      workflowFinding(
        "VISP.WORKFLOW.WARNING",
        "Policy file is missing. Run `visp-kit policy init` to persist it."
      ),
      {
        code: "VSP007",
        source: "policy",
        severity: "error",
        effect: "blocks",
        message: "Implementation requires a context pack.",
        recommendation: "Run visp-kit context --next.",
        evidence: ["Task context JSON was not found."]
      },
      {
        code: "VSP018",
        source: "policy",
        severity: "error",
        effect: "blocks",
        message: "Policy file is missing.",
        recommendation: "Run visp-kit policy init --strictness strict.",
        evidence: [".visp/policy.json was not found."]
      },
      {
        code: "VSP018",
        source: "policy",
        severity: "warning",
        effect: "none",
        message: "Policy file is missing.",
        recommendation: "Run visp-kit policy init --strictness strict.",
        evidence: [".visp/policy.json was not found; default policy was used in memory."]
      },
      {
        code: "VSP020",
        source: "policy",
        severity: "error",
        effect: "blocks",
        message: "Implementation checklist evidence is missing.",
        recommendation: "Run visp-kit context T001.",
        evidence: [
          ".visp/features/<feature>/context/T001.implementation-checklist.json was not found."
        ]
      }
    ];
  }

  if (inconclusiveFinding === undefined) {
    throw new TypeError("The inconclusive v3 expectation requires its dynamic finding.");
  }

  return [
    {
      code: "VISP.CONTRACT.AUTHORITY_UNAVAILABLE",
      source: "contract",
      severity: "error",
      effect: "uncertain",
      message: "The next-step input does not contain a coherent permission decision.",
      recommendation: "Re-evaluate the authoritative Kit gate for the exact next action.",
      evidence: ["visp-kit override validate"]
    },
    workflowFinding("VISP.WORKFLOW.STATE_BLOCKER", inconclusiveFinding),
    workflowFinding("VISP.WORKFLOW.WARNING", "Git repository unavailable.")
  ];
}

async function expectedPhase8ActionV3(
  targetPath: string,
  scenario: Phase8V3Scenario,
  inconclusiveFinding?: string
): Promise<WorkflowActionV3> {
  const featurePath = ".visp/features/001-add-note-pinning";
  const readDefinitions = [
    { id: "project-policy", role: "policy", path: ".visp/policy.json" },
    { id: "feature-intent", role: "intent", path: `${featurePath}/intent.json` },
    {
      id: "feature-specification",
      role: "specification",
      path: `${featurePath}/spec.json`
    },
    { id: "feature-plan", role: "plan", path: `${featurePath}/plan.json` },
    { id: "task-graph", role: "task_graph", path: `${featurePath}/task-graph.json` }
  ] as const;
  const requiredReads: CanonicalWorkflowActionIdentityInput["requiredReads"] = await Promise.all(
    readDefinitions
      .filter(({ role }) => role !== "policy" || scenario !== "blocked")
      .map(async ({ id, role, path: readPath }) => ({
        id,
        role,
        path: readPath,
        contentHash: `sha256:${await sha256File(path.join(targetPath, readPath))}` as const,
        freshness: "content_hash" as const
      }))
  );
  const nextCommand =
    scenario === "ready"
      ? "visp-kit context --next"
      : scenario === "blocked"
        ? "visp-kit policy init --strictness strict"
        : "visp-kit override validate";
  const findings = expectedPhase8Findings(scenario, nextCommand, inconclusiveFinding);
  const writablePaths = [`${featurePath}/task-graph.json`, `${featurePath}/traceability.json`];
  const identityInput = {
    canonicalVersion: "1.0",
    phase: "context",
    feature: { id: "001", slug: "add-note-pinning" },
    task: {
      id: "T001",
      title: "Implement note pinning helper",
      status: "ready",
      dependsOn: [],
      parallelizable: false
    },
    taskClass: { state: "available", value: "bounded_feature" },
    risk: {
      level: { state: "available", value: "medium" },
      factors: { state: "available", value: [] }
    },
    assurance: {
      level: "advisory",
      profile:
        scenario === "inconclusive"
          ? { state: "unavailable", reasonCode: "not_captured" }
          : { state: "available", value: "behavioral" },
      workflowStrictness:
        scenario === "inconclusive"
          ? { state: "unavailable" as const, reasonCode: "not_captured" as const }
          : { state: "available" as const, value: "standard" as const }
    },
    goal: "Update the note helper and test coverage for pinning.",
    baseCommit: { state: "unavailable", reasonCode: "not_captured" },
    requiredReads,
    scope: {
      writablePaths,
      expectedPaths: { state: "available", value: writablePaths },
      forbiddenPaths: [
        "Dependency manifests and lockfiles unless dependency approval is part of this task"
      ],
      operationLimits: { state: "unavailable", reasonCode: "not_captured" }
    },
    claims: {
      state: "available",
      value: [
        {
          id: "REQ001",
          statement: "The note helper must preserve explicit pin state.",
          priority: "must",
          acceptanceCriterionIds: ["AC001"],
          accountableOwner: {
            state: "unavailable",
            reasonCode: "not_in_source_artifact"
          }
        }
      ]
    },
    validationOracles: [
      {
        id: "AC001",
        claimId: "REQ001",
        statement:
          "Pinning a note places it before unpinned notes and unpinning restores ordinary ordering.",
        testable: true,
        validationMethod: "unit"
      }
    ],
    validationCommands: ["pnpm test"],
    requiredEvidence: { state: "unavailable", reasonCode: "not_in_source_artifact" },
    policy: {
      status: { state: "unavailable", reasonCode: "not_captured" },
      appliedOverrides: { state: "unavailable", reasonCode: "not_captured" }
    },
    findings,
    verdict: scenario,
    nextCommand
  } satisfies CanonicalWorkflowActionIdentityInput;
  const actionId = `sha256:${createHash("sha256")
    .update(expectedWorkflowActionIdentityDomain, "utf8")
    .update(expectedCanonicalJson(identityInput), "utf8")
    .digest("hex")}`;

  return {
    protocolVersion: "3.0",
    canonicalVersion: identityInput.canonicalVersion,
    actionId,
    phase: identityInput.phase,
    feature: identityInput.feature,
    task: identityInput.task,
    taskClass: identityInput.taskClass,
    risk: identityInput.risk,
    assurance: identityInput.assurance,
    goal: identityInput.goal,
    baseCommit: identityInput.baseCommit,
    requiredReads: [...identityInput.requiredReads],
    scope: identityInput.scope,
    claims: identityInput.claims,
    validationOracles: identityInput.validationOracles,
    validationCommands: identityInput.validationCommands,
    requiredEvidence: identityInput.requiredEvidence,
    policy: identityInput.policy,
    findings: identityInput.findings,
    verdict: identityInput.verdict,
    nextCommand: identityInput.nextCommand
  };
}

async function captureNextAction(
  targetPath: string,
  args: readonly string[]
): Promise<{ stdout: string; stderr: string; exitCode: string | number | undefined }> {
  const output: string[] = [];
  const errors: string[] = [];
  process.exitCode = undefined;
  await createCli({
    writeOut: (value) => output.push(value),
    writeErr: (value) => errors.push(value)
  }).parseAsync(["node", "visp", "next", targetPath, ...args]);
  return { stdout: output.join(""), stderr: errors.join(""), exitCode: process.exitCode };
}

describe("visp-kit next command", () => {
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

    expect(output.join("")).toContain("visp-kit init");
  });

  it("recommends scan after initialization", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--explain"]);

    expect(output.join("")).toContain("visp-kit scan");
    expect(output.join("")).toContain("Reason:");
  });

  it("prints only the command when requested", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "next", tempDir, "--command-only"]);

    expect(output.join("")).toBe("visp-kit context --next\n");
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
    expect(summary.nextCommand).toBe("visp-kit context --next");
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
    expect(action.nextCommand).toBe("visp-kit context --next");
  });

  it("keeps omitted, explicit v2, and Hyper-shaped v2 output byte-identical", async () => {
    await createPhase8Fixture(tempDir);
    const outputs: string[] = [];

    for (const args of [
      ["--format", "json"],
      ["--format", "json", "--protocol", "2.0"],
      ["--format", "json", "--json"]
    ]) {
      const result = await captureNextAction(tempDir, args);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBeUndefined();
      outputs.push(result.stdout);
    }

    expect(outputs[0]).toBe(outputs[1]);
    expect(outputs[0]).toBe(outputs[2]);
    expectExactWorkflowActionJson(outputs[0]!, await expectedPhase8Action(tempDir));
  });

  it("returns the flat strict WorkflowActionV3 contract when explicitly selected", async () => {
    await createPhase8Fixture(tempDir);
    const result = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);

    expectExactWorkflowActionV3Json(result.stdout, await expectedPhase8ActionV3(tempDir, "ready"));
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBeUndefined();
  });

  it("adds identity-bound evidence only in WorkflowAction 3.1", async () => {
    await createPhase8Fixture(tempDir);
    const result = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.1"]);
    const action = expectExactWorkflowActionV31Json(result.stdout);
    const { protocolVersion: _protocolVersion, actionId, ...identity } = action;

    expect(action.canonicalVersion).toBe("1.1");
    expect(action.evidence).toEqual({ state: "unavailable", reasonCode: "source_missing" });
    expect(createWorkflowActionIdV1_1(identity)).toBe(actionId);
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBeUndefined();
  });

  it.each([
    "auto",
    "4.0",
    "3",
    "03.0",
    " 3.0"
  ])("rejects unsupported protocol %s with stable JSON before workflow evaluation", async (requested) => {
    const output: string[] = [];
    const errors: string[] = [];
    const runNext = vi.fn(async () => {
      throw new Error("workflow must not run");
    });
    const program = createCli({
      runNext: runNext as never,
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      "--format",
      "json",
      "--protocol",
      requested
    ]);

    expect(runNext).not.toHaveBeenCalled();
    expect(errors.join("")).toBe("");
    expect(output.join("")).toBe(
      `${JSON.stringify(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_WORKFLOW_ACTION_PROTOCOL",
            requested,
            supported: ["2.0", "3.0", "3.1", "3.2", "3.4"],
            default: "2.0"
          }
        },
        null,
        2
      )}\n`
    );
    expect(process.exitCode).toBe(1);
  });

  it.each([
    ["without a format", "3.0", []],
    ["unsupported without a format", "4.0", []],
    ["with legacy JSON", "3.0", ["--json"]],
    ["with text format", "3.0", ["--format", "text"]],
    ["before invalid-format handling", "4.0", ["--format", "yaml"]]
  ] as const)("rejects protocol %s before workflow evaluation", async (_label, requested, extraArgs) => {
    const output: string[] = [];
    const errors: string[] = [];
    const runNext = vi.fn(async () => {
      throw new Error("workflow must not run");
    });
    const program = createCli({
      runNext: runNext as never,
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });

    await program.parseAsync([
      "node",
      "visp",
      "next",
      tempDir,
      ...extraArgs,
      "--protocol",
      requested
    ]);

    expect(runNext).not.toHaveBeenCalled();
    expect(output.join("")).toBe("");
    expect(errors.join("")).toBe("[error] --protocol requires --format json.\n");
    expect(process.exitCode).toBe(1);
  });

  it("keeps the protocol-format error uncolored on a TTY", async () => {
    const output: string[] = [];
    const errors: string[] = [];
    const runNext = vi.fn(async () => {
      throw new Error("workflow must not run");
    });
    const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

    try {
      Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
      await createCli({
        runNext: runNext as never,
        writeOut: (value) => output.push(value),
        writeErr: (value) => errors.push(value)
      }).parseAsync(["node", "visp", "next", tempDir, "--protocol", "3.0"]);
    } finally {
      if (ttyDescriptor === undefined) {
        Reflect.deleteProperty(process.stdout, "isTTY");
      } else {
        Object.defineProperty(process.stdout, "isTTY", ttyDescriptor);
      }
    }

    expect(runNext).not.toHaveBeenCalled();
    expect(output.join("")).toBe("");
    expect(errors.join("")).toBe("[error] --protocol requires --format json.\n");
  });

  it("returns a blocked WorkflowAction when the authoritative next gate blocks", async () => {
    await createPhase8Fixture(tempDir);
    await rm(path.join(tempDir, ".visp", "policy.json"), { force: true });
    const v2Outputs: string[] = [];
    for (const args of [
      ["--format", "json"],
      ["--format", "json", "--protocol", "2.0"],
      ["--format", "json", "--json"]
    ]) {
      const result = await captureNextAction(tempDir, args);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(1);
      v2Outputs.push(result.stdout);
    }
    expect(v2Outputs[1]).toBe(v2Outputs[0]);
    expect(v2Outputs[2]).toBe(v2Outputs[0]);

    const findings = [
      "Required read is unavailable: .visp/policy.json.",
      "VSP018: Policy file is missing.",
      "VSP007: Implementation requires a context pack.",
      "VSP020: Implementation checklist evidence is missing."
    ];
    const action = expectExactWorkflowActionJson(
      v2Outputs[0]!,
      await expectedPhase8Action(tempDir, {
        verdict: "blocked",
        findings,
        nextCommand: "visp-kit policy init --strictness strict"
      })
    );
    const v3Result = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);
    expectExactWorkflowActionV3Json(
      v3Result.stdout,
      await expectedPhase8ActionV3(tempDir, "blocked")
    );
    expect(v3Result.stderr).toBe("");
    expect(v3Result.exitCode).toBe(1);
    expect(action).toMatchObject({
      protocolVersion: "2.0",
      verdict: "blocked",
      nextCommand: "visp-kit policy init --strictness strict"
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
    expect(action.nextCommand).toBe("visp-kit policy validate");
    expect(action.verdict).not.toBe("ready");
  });

  it("returns an inconclusive WorkflowAction when override evaluation is unavailable", async () => {
    await createPhase8Fixture(tempDir);
    await writeFile(path.join(tempDir, ".visp", "overrides.json"), "{ malformed overrides", "utf8");
    const finding = `Override or gate evaluation is unavailable: Invalid JSON in ${path.join(
      tempDir,
      ".visp",
      "overrides.json"
    )}: Expected property name or '}' in JSON at position 2 (line 1 column 3)`;
    const v2Outputs: string[] = [];
    for (const args of [
      ["--format", "json"],
      ["--format", "json", "--protocol", "2.0"],
      ["--format", "json", "--json"]
    ]) {
      const result = await captureNextAction(tempDir, args);
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(1);
      v2Outputs.push(result.stdout);
    }
    expect(v2Outputs[1]).toBe(v2Outputs[0]);
    expect(v2Outputs[2]).toBe(v2Outputs[0]);
    expect(v2Outputs[0]!.trim()).not.toBe("undefined");
    const action = expectExactWorkflowActionJson(
      v2Outputs[0]!,
      await expectedPhase8Action(tempDir, {
        verdict: "inconclusive",
        findings: [finding],
        nextCommand: "visp-kit override validate"
      })
    );
    const v3Result = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);
    expectExactWorkflowActionV3Json(
      v3Result.stdout,
      await expectedPhase8ActionV3(tempDir, "inconclusive", finding)
    );
    expect(v3Result.stderr).toBe("");
    expect(v3Result.exitCode).toBe(1);
    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toHaveLength(1);
    expect(action.findings[0]).toMatch(/^Override or gate evaluation is unavailable:/u);
    expect(
      action.findings.some(
        (finding) => /override/i.test(finding) && /(unavailable|evaluat)/i.test(finding)
      )
    ).toBe(true);
    expect(action.nextCommand).toBe("visp-kit override validate");
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
    // The exit code follows the frame that was printed: an inconclusive
    // verdict exits nonzero, exactly as a ready one exits zero. The previous
    // assertion (exit 0 with an inconclusive frame) was the mirror image of
    // the live contradiction this rule repairs — exit 1 with verdict=ready,
    // which Hyper rightly refused as workflow_action_contradiction.
    expect(process.exitCode).toBe(1);
    expect(action.verdict).toBe("inconclusive");
    expect(action.findings).toEqual([`Required read is unavailable: ${missingPath}.`]);
    expect(action.requiredReads.map((item) => item.path)).not.toContain(missingPath);
    expect(action.nextCommand).toBe("Use .visp/prompts/current-task.prompt.md with your agent");
  });

  it("raises assurance through project policy", async () => {
    await createPhase8Fixture(tempDir);
    const policyPath = path.join(tempDir, ".visp", "policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>;
    policy.assurance = { profile: "critical" };
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    const result = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);
    const action = workflowActionV3Schema.parse(JSON.parse(result.stdout));

    expect(action.assurance.profile).toEqual({ state: "available", value: "critical" });
  });

  it("requires an auditable VSP022 override to lower assurance", async () => {
    await createPhase8Fixture(tempDir);
    const policyPath = path.join(tempDir, ".visp", "policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8")) as Record<string, unknown>;
    policy.assurance = { profile: "routine" };
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    const blocked = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);
    const blockedAction = workflowActionV3Schema.parse(JSON.parse(blocked.stdout));
    expect(blockedAction.assurance.profile).toEqual({
      state: "available",
      value: "behavioral"
    });
    expect(blockedAction.findings.some((finding) => finding.code === "VSP022")).toBe(true);

    await createCli({ writeOut: () => undefined }).parseAsync([
      "node",
      "visp",
      "override",
      "create",
      "VSP022",
      tempDir,
      "--scope",
      "task",
      "--feature",
      "001",
      "--task",
      "T001",
      "--reason",
      "A human accepted routine assurance for this bounded fixture task.",
      "--json"
    ]);

    const allowed = await captureNextAction(tempDir, ["--format", "json", "--protocol", "3.0"]);
    const allowedAction = workflowActionV3Schema.parse(JSON.parse(allowed.stdout));
    expect(allowedAction.assurance.profile).toEqual({ state: "available", value: "routine" });
    expect(allowedAction.findings.some((finding) => finding.code === "VSP022")).toBe(true);
    expect(allowedAction.findings.find((finding) => finding.code === "VSP022")?.severity).toBe(
      "warning"
    );
  });
});
