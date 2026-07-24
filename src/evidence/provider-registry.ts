import {
  evidenceProviderRunSchema,
  type EvidenceProviderRun,
  type ProviderFailureCode
} from "../artifacts/schemas/provider-run.schema.js";
import {
  type EvidenceProviderIdentity,
  type EvidenceResult
} from "../artifacts/schemas/evidence.schema.js";
import { type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../artifacts/schemas/verification.schema.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";

export const builtinEvidenceProviders = [
  { id: "command", version: "1.0" },
  { id: "validation-oracle", version: "1.0" }
] as const satisfies readonly EvidenceProviderIdentity[];

export type ProviderOracleObservation = {
  readonly oracleId: string;
  readonly status: "passed" | "failed" | "inconclusive";
  readonly reason: string;
};

export type EvidenceProviderInput = {
  readonly phase: "baseline" | "candidate";
  readonly targetPath: string;
  readonly plan: OraclePlan;
  readonly commands: readonly VerificationCommandResult[];
  readonly oracleObservations: readonly ProviderOracleObservation[];
  readonly inputHashes: readonly {
    readonly id: string;
    readonly sha256: `sha256:${string}`;
  }[];
  readonly generatedAt: string;
};

export type EvidenceProviderAdapter = {
  readonly identity: EvidenceProviderIdentity;
  readonly run: (input: EvidenceProviderInput) => unknown;
};

export type EvidenceProviderRegistry = ReadonlyMap<string, EvidenceProviderAdapter>;

function providerKey(provider: EvidenceProviderIdentity): string {
  return `${provider.id}@${provider.version}`;
}

function providerRunId(input: EvidenceProviderInput, provider: EvidenceProviderIdentity): string {
  return `PROVIDER-${input.phase}-${provider.id}`;
}

function failureRun(input: {
  readonly phase: EvidenceProviderInput["phase"];
  readonly provider: EvidenceProviderIdentity;
  readonly code: ProviderFailureCode;
  readonly reason: string;
}): EvidenceProviderRun {
  return {
    version: "1.0",
    id: `PROVIDER-${input.phase}-${input.provider.id}`,
    provider: input.provider,
    phase: input.phase,
    status: "inconclusive",
    failure: { code: input.code, reason: input.reason },
    results: []
  };
}

function commandFailure(
  command: VerificationCommandResult
): { code: ProviderFailureCode; reason: string } | undefined {
  if (command.skipped) {
    return {
      code: "skipped_evidence",
      reason: `Required command was skipped: ${command.command}.`
    };
  }
  if (command.timedOut) {
    return {
      code: "timeout",
      reason: `Required command timed out: ${command.command}.`
    };
  }
  if (
    command.exitCode === null ||
    command.exitCode === 127 ||
    command.exitCode === 9009 ||
    /\b(?:ENOENT|not found|not recognized)\b/iu.test(command.stderr)
  ) {
    return {
      code: "command_not_found",
      reason: `Required command could not be started: ${command.command}.`
    };
  }
  return undefined;
}

function commandEvidenceResult(
  input: EvidenceProviderInput,
  command: VerificationCommandResult,
  index: number
): EvidenceResult {
  const failure = commandFailure(command);
  const independence = input.plan.testStrengthEvidence[0]?.independence ?? "implementer_authored";
  const executable = command.runner?.executable ?? command.command;
  const args = command.runner?.args ?? [];
  const outcome: EvidenceResult["outcome"] =
    failure !== undefined
      ? { status: "inconclusive", reason: failure.reason }
      : command.success
        ? { status: "passed" }
        : { status: "failed", reason: `Command exited with code ${command.exitCode}.` };

  return {
    version: "1.0",
    id: `EVID-${input.phase}-COMMAND-${index + 1}`,
    requirementId: `REQ-${input.phase}-COMMAND-${index + 1}`,
    provider: { id: "command", version: "1.0" },
    target: { kind: "command", command: command.command },
    operation: {
      kind: "command",
      executable,
      args: [...args],
      cwd: command.cwd
    },
    inputHashes: [...input.inputHashes],
    startedAt: command.startedAt,
    endedAt: command.endedAt,
    freshness: {
      status: "fresh",
      checkedAt: input.generatedAt,
      inputHashes: [...input.inputHashes]
    },
    independence,
    output: {
      kind: "captured",
      stdout: command.stdout,
      stderr: command.stderr,
      truncated: command.stdoutTruncated || command.stderrTruncated
    },
    outcome
  };
}

const commandAdapter: EvidenceProviderAdapter = {
  identity: { id: "command", version: "1.0" },
  run(input) {
    const results = input.commands.map((command, index) =>
      commandEvidenceResult(input, command, index)
    );
    const failure = input.commands.map(commandFailure).find((value) => value !== undefined);
    return failure === undefined
      ? {
          version: "1.0",
          id: providerRunId(input, this.identity),
          provider: this.identity,
          phase: input.phase,
          status: "passed",
          failure: null,
          results
        }
      : failureRun({
          phase: input.phase,
          provider: this.identity,
          code: failure.code,
          reason: failure.reason
        });
  }
};

function oracleEvidenceResult(
  input: EvidenceProviderInput,
  observation: ProviderOracleObservation,
  index: number
): EvidenceResult {
  return {
    version: "1.0",
    id: `EVID-${input.phase}-ORACLE-${index + 1}`,
    requirementId: `REQ-${input.phase}-ORACLE-${index + 1}`,
    provider: { id: "validation-oracle", version: "1.0" },
    target: { kind: "validation_oracle", oracleId: observation.oracleId },
    operation: {
      kind: "inspection",
      inspector: "visp.validation-oracle@1.0",
      subject: `${input.phase}:${observation.oracleId}`
    },
    inputHashes: [...input.inputHashes],
    startedAt: input.generatedAt,
    endedAt: input.generatedAt,
    freshness: {
      status: "fresh",
      checkedAt: input.generatedAt,
      inputHashes: [...input.inputHashes]
    },
    independence: "pre_approved",
    output: { kind: "none", reason: observation.reason },
    outcome:
      observation.status === "passed"
        ? { status: "passed" }
        : observation.status === "failed"
          ? { status: "failed", reason: observation.reason }
          : { status: "inconclusive", reason: observation.reason }
  };
}

const validationOracleAdapter: EvidenceProviderAdapter = {
  identity: { id: "validation-oracle", version: "1.0" },
  run(input) {
    const observations =
      input.oracleObservations.length > 0
        ? input.oracleObservations
        : [
            {
              oracleId: "ROUTINE-COMMAND-BATCH",
              status: input.commands.some((command) => command.skipped || command.exitCode === null)
                ? ("inconclusive" as const)
                : input.commands.every((command) => command.success)
                  ? ("passed" as const)
                  : ("failed" as const),
              reason: "Routine assurance uses the locked command-batch observation."
            }
          ];
    const results = observations.map((observation, index) =>
      oracleEvidenceResult(input, observation, index)
    );
    const inconclusive = observations.find((observation) => observation.status === "inconclusive");
    return inconclusive === undefined
      ? {
          version: "1.0",
          id: providerRunId(input, this.identity),
          provider: this.identity,
          phase: input.phase,
          status: "passed",
          failure: null,
          results
        }
      : failureRun({
          phase: input.phase,
          provider: this.identity,
          code: "skipped_evidence",
          reason: inconclusive.reason
        });
  }
};

export function createBuiltinEvidenceProviderRegistry(): EvidenceProviderRegistry {
  return new Map(
    [commandAdapter, validationOracleAdapter].map((adapter) => [
      providerKey(adapter.identity),
      adapter
    ])
  );
}

export function providerInputHashes(input: {
  readonly plan: OraclePlan;
  readonly lockHash: string;
  readonly cacheKeyHash: string;
  readonly baselineSha256?: string;
}): readonly { id: string; sha256: `sha256:${string}` }[] {
  return [
    { id: "oracle-plan", sha256: hashOracleValue(input.plan) },
    { id: "oracle-lock", sha256: input.lockHash as `sha256:${string}` },
    { id: "baseline-cache-key", sha256: input.cacheKeyHash as `sha256:${string}` },
    ...(input.baselineSha256 === undefined
      ? []
      : [{ id: "baseline-evidence", sha256: input.baselineSha256 as `sha256:${string}` }])
  ];
}

export function runRequiredEvidenceProviders(input: {
  readonly requiredProviders: readonly EvidenceProviderIdentity[];
  readonly providerInput: EvidenceProviderInput;
  readonly registry?: EvidenceProviderRegistry;
}): readonly EvidenceProviderRun[] {
  const registry = input.registry ?? createBuiltinEvidenceProviderRegistry();

  return input.requiredProviders.map((provider) => {
    const adapter = registry.get(providerKey(provider));
    if (adapter === undefined) {
      return failureRun({
        phase: input.providerInput.phase,
        provider,
        code: "unsupported_provider",
        reason: `Evidence provider ${providerKey(provider)} is not allowlisted.`
      });
    }
    const candidate = adapter.run(input.providerInput);
    const parsed = evidenceProviderRunSchema.safeParse(candidate);
    return parsed.success
      ? parsed.data
      : failureRun({
          phase: input.providerInput.phase,
          provider,
          code: "malformed_output",
          reason: `Evidence provider ${providerKey(provider)} returned malformed output.`
        });
  });
}

export function preflightRequiredEvidenceProviders(input: {
  readonly requiredProviders: readonly EvidenceProviderIdentity[];
  readonly phase: EvidenceProviderInput["phase"];
  readonly registry?: EvidenceProviderRegistry;
}): readonly EvidenceProviderRun[] {
  const registry = input.registry ?? createBuiltinEvidenceProviderRegistry();
  return input.requiredProviders.flatMap((provider) =>
    registry.has(providerKey(provider))
      ? []
      : [
          failureRun({
            phase: input.phase,
            provider,
            code: "unsupported_provider",
            reason: `Evidence provider ${providerKey(provider)} is not allowlisted.`
          })
        ]
  );
}

export function providerRunsPass(runs: readonly EvidenceProviderRun[]): boolean {
  return runs.length > 0 && runs.every((run) => run.status === "passed");
}

export function providerRunsMatchRequirements(
  runs: readonly EvidenceProviderRun[],
  requiredProviders: readonly EvidenceProviderIdentity[]
): boolean {
  const actual = runs.map((run) => providerKey(run.provider)).sort();
  const required = requiredProviders.map(providerKey).sort();
  return (
    new Set(actual).size === actual.length &&
    actual.length === required.length &&
    actual.every((provider, index) => provider === required[index])
  );
}
