import { candidateEvidenceArtifactPath } from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import { type BaselineOracleResult } from "../artifacts/schemas/baseline-evidence.schema.js";
import {
  candidateEvidenceSchema,
  type CandidateEvidence,
  type CandidateOracleComparison
} from "../artifacts/schemas/candidate-evidence.schema.js";
import { type OraclePlanOracle } from "../artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
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
};

export type CandidateVerificationSummary = {
  readonly success: boolean;
  readonly taskId: string;
  readonly outcome: CandidateEvidence["outcome"];
  readonly action: "executed" | "previewed";
  readonly reportPath: string | null;
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
  const commands = await runVerificationCommands({
    targetPath: authorization.value.targetPath,
    commands: authorization.value.plan.validationCommands,
    dryRun: options.dryRun ?? false,
    commandRunner: options.commandRunner,
    now: () => generatedAt,
    jsonOutput: options.jsonOutput
  });
  const oracles = evaluateCandidateOracles({
    oracles: authorization.value.plan.oracles,
    baseline: baseline.oracles,
    commands
  });
  const candidate = {
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
    oracles,
    commands,
    outcome:
      oracles.length === 0
        ? observeVerificationCommands(commands)
        : evaluateCandidateOutcome(oracles),
    generatedAt
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
    formatKeyValue("Action", value.action),
    ...(value.reportPath === null ? [] : [formatKeyValue("Artifact", value.reportPath)]),
    "",
    "Next:",
    `  ${value.nextCommand}`
  ].join("\n")}\n`;
}
