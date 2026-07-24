import { describe, expect, it } from "vitest";

import { type OraclePlan } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../../../src/artifacts/schemas/verification.schema.js";
import {
  createBuiltinEvidenceProviderRegistry,
  preflightRequiredEvidenceProviders,
  runRequiredEvidenceProviders,
  type EvidenceProviderAdapter
} from "../../../src/evidence/provider-registry.js";

const digest = `sha256:${"a".repeat(64)}` as const;

function plan(
  requiredProviders = [
    { id: "command", version: "1.0" },
    { id: "validation-oracle", version: "1.0" }
  ]
): OraclePlan {
  const binding = { path: ".visp/input.json", sha256: digest };
  return {
    version: "1.0",
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    assuranceProfile: "behavioral",
    criticalReviewApproval: { required: false, status: "not_required" },
    oracles: [
      {
        id: "ORACLE-AC001",
        requirementId: "REQ001",
        acceptanceCriterionId: "AC001",
        description: "Behavior is observable.",
        priority: "must",
        validationMethod: "unit",
        baseline: { expected: "recorded" },
        candidate: { expected: "passed" }
      }
    ],
    validationCommands: ["pnpm test"],
    testStrengthEvidence: [
      {
        path: "tests/example.test.ts",
        sha256: digest,
        independence: "pre_approved",
        source: { kind: "explicit_pre_approval", reference: "APPROVAL-1" }
      }
    ],
    bindings: {
      policy: binding,
      specification: binding,
      plan: binding,
      taskGraph: binding,
      context: binding,
      task: { id: "T001", sha256: digest }
    },
    baseCommit: { status: "unavailable", reason: "Fixture." },
    requiredProviders,
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
}

function command(patch: Partial<VerificationCommandResult> = {}): VerificationCommandResult {
  return {
    command: "pnpm test",
    cwd: "/repo",
    exitCode: 0,
    success: true,
    durationMs: 1,
    startedAt: "2026-07-25T00:00:00.000Z",
    endedAt: "2026-07-25T00:00:00.001Z",
    stdout: "ok",
    stderr: "",
    stdoutTruncated: false,
    stderrTruncated: false,
    skipped: false,
    skipReason: null,
    timedOut: false,
    ...patch
  };
}

function providerInput(commands = [command()]) {
  return {
    phase: "candidate" as const,
    targetPath: "/repo",
    plan: plan(),
    commands,
    oracleObservations: [
      {
        oracleId: "ORACLE-AC001",
        status: "passed" as const,
        reason: "Candidate passed."
      }
    ],
    inputHashes: [{ id: "oracle-plan", sha256: digest }],
    generatedAt: "2026-07-25T00:00:00.001Z"
  };
}

describe("evidence provider registry", () => {
  it("runs the closed built-in providers with structured fresh results", () => {
    const runs = runRequiredEvidenceProviders({
      requiredProviders: plan().requiredProviders,
      providerInput: providerInput()
    });

    expect(runs.map((run) => [run.provider.id, run.status])).toEqual([
      ["command", "passed"],
      ["validation-oracle", "passed"]
    ]);
    expect(runs[0]?.results[0]).toMatchObject({
      provider: { id: "command", version: "1.0" },
      freshness: { status: "fresh" },
      independence: "pre_approved",
      outcome: { status: "passed" }
    });
  });

  it("rejects unsupported provider IDs and versions before execution", () => {
    const requiredProviders = [{ id: "unknown", version: "9.0" }];
    const failures = preflightRequiredEvidenceProviders({
      requiredProviders,
      phase: "baseline"
    });

    expect(failures).toEqual([
      expect.objectContaining({
        status: "inconclusive",
        failure: expect.objectContaining({ code: "unsupported_provider" })
      })
    ]);
  });

  it.each([
    ["timeout", command({ success: false, exitCode: null, timedOut: true }), "timeout"],
    ["command not found", command({ success: false, exitCode: null }), "command_not_found"],
    [
      "shell command not found",
      command({ success: false, exitCode: 127, stderr: "missing-tool: not found" }),
      "command_not_found"
    ],
    [
      "skipped evidence",
      command({ skipped: true, skipReason: "not run", exitCode: null }),
      "skipped_evidence"
    ]
  ])("makes %s infrastructure failure inconclusive", (_name, result, code) => {
    const [run] = runRequiredEvidenceProviders({
      requiredProviders: [{ id: "command", version: "1.0" }],
      providerInput: providerInput([result, command()])
    });

    expect(run).toMatchObject({
      status: "inconclusive",
      failure: { code }
    });
  });

  it("preserves an ordinary nonzero exit as a valid failed observation", () => {
    const [run] = runRequiredEvidenceProviders({
      requiredProviders: [{ id: "command", version: "1.0" }],
      providerInput: providerInput([command({ success: false, exitCode: 1 })])
    });

    expect(run?.status).toBe("passed");
    expect(run?.failure).toBeNull();
    expect(run?.results[0]?.outcome).toMatchObject({ status: "failed" });
  });

  it("converts malformed adapter output into a fail-closed provider run", () => {
    const malformed: EvidenceProviderAdapter = {
      identity: { id: "command", version: "1.0" },
      run: () => ({ status: "passed" })
    };
    const registry = new Map([
      ["command@1.0", malformed],
      ...createBuiltinEvidenceProviderRegistry()
    ]);
    registry.set("command@1.0", malformed);
    const [run] = runRequiredEvidenceProviders({
      requiredProviders: [{ id: "command", version: "1.0" }],
      providerInput: providerInput(),
      registry
    });

    expect(run).toMatchObject({
      status: "inconclusive",
      failure: { code: "malformed_output" }
    });
  });
});
