import { candidateEvidenceArtifactPath } from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { type BaselineOracleResult } from "../artifacts/schemas/baseline-evidence.schema.js";
import {
  candidateEvidenceSchema,
  type CandidateEvidence,
  type CandidateOracleComparison
} from "../artifacts/schemas/candidate-evidence.schema.js";
import { type OraclePlan, type OraclePlanOracle } from "../artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  preflightRequiredEvidenceProviders,
  providerInputHashes,
  providerRunsPass,
  runRequiredEvidenceProviders,
  type EvidenceProviderRegistry
} from "../evidence/provider-registry.js";
import {
  candidateEvidenceHash,
  validateCandidateEvidenceIntegrity
} from "../evidence/candidate-evidence-validator.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { runVerificationCommands } from "../verification/verification-runner.js";
import { observeVerificationCommands } from "./baseline-verification.workflow.js";
import {
  loadOracleAuthorization,
  type OracleAuthorizationWorkflowOptions
} from "./oracle-authorization.workflow.js";

export type CandidateVerificationWorkflowOptions = OracleAuthorizationWorkflowOptions & {
  readonly jsonOutput?: boolean;
  readonly commandRunner?: CommandRunner;
  readonly commandTimeoutMs?: number;
  readonly providerRegistry?: EvidenceProviderRegistry;
};

export type CandidateVerificationSummary = {
  readonly success: boolean;
  readonly taskId: string;
  readonly outcome: CandidateEvidence["outcome"];
  readonly action: "executed" | "previewed";
  readonly reportPath: string | null;
  readonly testStrength: CandidateEvidence["testStrength"]["status"];
  readonly providers: readonly {
    readonly id: string;
    readonly version: string;
    readonly status: string;
    readonly failureCode: string | null;
    readonly reason: string | null;
  }[];
  readonly comparisons: readonly {
    readonly oracleId: string;
    readonly baselineObserved: string;
    readonly candidateObserved: string;
    readonly outcome: string;
  }[];
  readonly commands: readonly {
    readonly command: string;
    readonly success: boolean;
    readonly exitCode: number | null;
    readonly skipped: boolean;
  }[];
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

export function evaluateCandidateOracles(input: {
  readonly oracles: readonly OraclePlanOracle[];
  readonly baseline: readonly BaselineOracleResult[];
  readonly commands: readonly VerificationCommandResult[];
}): readonly CandidateOracleComparison[] {
  const candidateObserved = observeVerificationCommands(input.commands);
  const baselines = new Map(input.baseline.map((result) => [result.oracleId, result]));
  const baselineSetValid =
    baselines.size === input.baseline.length &&
    input.baseline.length === input.oracles.length &&
    input.oracles.every((oracle) => {
      const baseline = baselines.get(oracle.id);
      return baseline !== undefined && baseline.expected === oracle.baseline.expected;
    });

  return input.oracles.map((oracle) => {
    const baseline = baselines.get(oracle.id);
    const baselineComparison = baseline ?? {
      expected: oracle.baseline.expected,
      observed: "inconclusive" as const,
      expectationMet: false
    };
    const candidateExpectationMet = candidateObserved === oracle.candidate.expected;
    const outcome =
      !baselineSetValid ||
      baseline === undefined ||
      baseline.observed === "inconclusive" ||
      candidateObserved === "inconclusive"
        ? ("inconclusive" as const)
        : baseline.expectationMet && candidateExpectationMet
          ? ("passed" as const)
          : ("failed" as const);

    return {
      oracleId: oracle.id,
      baseline: {
        expected: baselineComparison.expected,
        observed: baselineComparison.observed,
        expectationMet: baselineComparison.expectationMet
      },
      candidate: {
        expected: oracle.candidate.expected,
        observed: candidateObserved,
        expectationMet: candidateExpectationMet
      },
      outcome
    };
  });
}

export function evaluateCandidateOutcome(
  comparisons: readonly CandidateOracleComparison[]
): CandidateEvidence["outcome"] {
  if (
    comparisons.length === 0 ||
    comparisons.some((comparison) => comparison.outcome === "inconclusive")
  ) {
    return "inconclusive";
  }
  return comparisons.every((comparison) => comparison.outcome === "passed") ? "passed" : "failed";
}

export function evaluateCandidateTestStrength(
  plan: Pick<OraclePlan, "assuranceProfile" | "testStrengthEvidence">
): CandidateEvidence["testStrength"] {
  const independence = plan.testStrengthEvidence.map((evidence) => evidence.independence);
  const passed = plan.assuranceProfile === "routine" || independence.length > 0;
  return {
    status: passed ? "passed" : "inconclusive",
    independence,
    reason: passed
      ? "The locked plan contains an independent test-strength signal or requires routine assurance."
      : "Behavioral and critical assurance require pre-existing or explicitly pre-approved test evidence."
  };
}

function summary(input: {
  readonly evidence: CandidateEvidence;
  readonly reportPath: string | null;
  readonly dryRun: boolean;
}): CandidateVerificationSummary {
  return {
    success: input.evidence.outcome === "passed" || input.dryRun,
    taskId: input.evidence.taskId,
    outcome: input.evidence.outcome,
    action: input.dryRun ? "previewed" : "executed",
    reportPath: input.reportPath,
    testStrength: input.evidence.testStrength.status,
    providers: input.evidence.providerRuns.map((run) => ({
      id: run.provider.id,
      version: run.provider.version,
      status: run.status,
      failureCode: run.failure?.code ?? null,
      reason: run.failure?.reason ?? null
    })),
    comparisons: input.evidence.oracles.map((comparison) => ({
      oracleId: comparison.oracleId,
      baselineObserved: comparison.baseline.observed,
      candidateObserved: comparison.candidate.observed,
      outcome: comparison.outcome
    })),
    commands: input.evidence.commands.map((command) => ({
      command: command.command,
      success: command.success,
      exitCode: command.exitCode,
      skipped: command.skipped
    })),
    nextCommand:
      input.evidence.outcome === "passed"
        ? `visp review --task ${input.evidence.taskId}`
        : `visp verify --candidate --task ${input.evidence.taskId}`,
    dryRun: input.dryRun
  };
}

export async function runCandidateVerificationWorkflow(
  options: CandidateVerificationWorkflowOptions = {}
): Promise<Result<CandidateVerificationSummary, VispError>> {
  const authorization = await loadOracleAuthorization(options);
  if (!authorization.ok) return authorization;
  const baseline = authorization.value.baselineEvidence;
  const baselineBinding = authorization.value.lock.baselineEvidence;
  if (baseline === undefined || baselineBinding === undefined) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Candidate evidence requires a current locked baseline for task ${authorization.value.plan.taskId}.`
      )
    );
  }

  const generatedAt = options.now ?? new Date().toISOString();
  const providerPreflight = preflightRequiredEvidenceProviders({
    requiredProviders: authorization.value.plan.requiredProviders,
    phase: "candidate",
    registry: options.providerRegistry
  });
  const commands =
    providerPreflight.length > 0
      ? []
      : await runVerificationCommands({
          targetPath: authorization.value.targetPath,
          commands: authorization.value.plan.validationCommands,
          dryRun: options.dryRun ?? false,
          commandRunner: options.commandRunner,
          now: () => generatedAt,
          jsonOutput: options.jsonOutput,
          timeoutMs: options.commandTimeoutMs
        });
  const oracles = evaluateCandidateOracles({
    oracles: authorization.value.plan.oracles,
    baseline: baseline.oracles,
    commands
  });
  const providerRuns =
    providerPreflight.length > 0
      ? providerPreflight
      : runRequiredEvidenceProviders({
          requiredProviders: authorization.value.plan.requiredProviders,
          registry: options.providerRegistry,
          providerInput: {
            phase: "candidate",
            targetPath: authorization.value.targetPath,
            plan: authorization.value.plan,
            commands,
            oracleObservations: oracles.map((oracle) => ({
              oracleId: oracle.oracleId,
              status:
                oracle.outcome === "not_applicable" ? ("inconclusive" as const) : oracle.outcome,
              reason:
                oracle.outcome === "passed"
                  ? "The candidate met the locked baseline/oracle comparison."
                  : "The candidate did not establish the locked baseline/oracle comparison."
            })),
            inputHashes: providerInputHashes({
              plan: authorization.value.plan,
              lockHash: authorization.value.lock.lockHash,
              cacheKeyHash: baseline.cacheKey.hash,
              baselineSha256: baselineBinding.sha256
            }),
            generatedAt
          }
        });
  const oracleOutcome =
    oracles.length === 0
      ? observeVerificationCommands(commands)
      : evaluateCandidateOutcome(oracles);
  const testStrength = evaluateCandidateTestStrength(authorization.value.plan);
  const candidateMaterial: Omit<CandidateEvidence, "evidenceHash"> = {
    version: "1.0" as const,
    id: `CANDIDATE-${authorization.value.plan.featureId}-${authorization.value.plan.taskId}`,
    featureId: authorization.value.plan.featureId,
    featureSlug: authorization.value.plan.featureSlug,
    taskId: authorization.value.plan.taskId,
    oraclePlan: {
      path: authorization.value.planPath,
      sha256: hashOracleValue(authorization.value.plan)
    },
    oracleAuthorization: authorization.value.binding,
    baselineEvidence: baselineBinding,
    baselineCacheKeySha256: baseline.cacheKey.hash,
    testStrength,
    oracles: [...oracles],
    providerRuns: [...providerRuns],
    commands: [...commands],
    outcome:
      providerRunsPass(providerRuns) && testStrength.status === "passed"
        ? oracleOutcome
        : ("inconclusive" as const),
    generatedAt
  };
  const candidate = {
    ...candidateMaterial,
    evidenceHash: candidateEvidenceHash(candidateMaterial)
  };
  const parsed = candidateEvidenceSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated candidate evidence is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
      )
    );
  }
  const integrity = validateCandidateEvidenceIntegrity({
    evidence: parsed.data,
    plan: authorization.value.plan,
    planPath: authorization.value.planPath,
    authorization: authorization.value.binding,
    baselineBinding,
    baselineCacheKeySha256: baseline.cacheKey.hash
  });
  if (!integrity.ok) return integrity;

  const dryRun = options.dryRun ?? false;
  const reportAbsolutePath = candidateEvidenceArtifactPath(
    authorization.value.targetPath,
    authorization.value.featureKey,
    authorization.value.plan.taskId
  );
  const reportPath = relativePath(authorization.value.targetPath, reportAbsolutePath);
  if (!dryRun) {
    const written = await writeArtifact(reportAbsolutePath, candidateEvidenceSchema, parsed.data, {
      artifactName: "candidate evidence"
    });
    if (!written.ok) return written;
  }

  return ok(
    summary({
      evidence: parsed.data,
      reportPath: dryRun ? null : reportPath,
      dryRun
    })
  );
}

export function formatCandidateVerificationSummary(value: CandidateVerificationSummary): string {
  return `${[
    formatHeader(value.success ? "Visp candidate complete" : "Visp candidate failed"),
    "",
    formatKeyValue("Task", value.taskId),
    formatKeyValue("Outcome", value.outcome),
    formatKeyValue("Test strength", value.testStrength),
    formatKeyValue("Action", value.action),
    ...(value.reportPath === null ? [] : [formatKeyValue("Artifact", value.reportPath)]),
    ...value.providers.map(
      (provider) =>
        `  Provider ${provider.id}@${provider.version}: ${provider.status}${provider.failureCode === null ? "" : ` (${provider.failureCode})`}`
    ),
    "",
    "Next:",
    `  ${value.nextCommand}`
  ].join("\n")}\n`;
}
