import {
  baselineEvidenceArtifactPath,
  oracleLockArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  baselineEvidenceSchema,
  type BaselineEvidence,
  type BaselineOracleResult
} from "../artifacts/schemas/baseline-evidence.schema.js";
import { oracleLockSchema } from "../artifacts/schemas/oracle-authorization.schema.js";
import { type OraclePlanOracle } from "../artifacts/schemas/oracle-plan.schema.js";
import { type VerificationCommandResult } from "../artifacts/schemas/verification.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { createBaselineCacheKey } from "../evidence/baseline-cache-key.js";
import { clearTaskImplementMarker } from "../gates/implement-marker.js";
import {
  createOracleLock,
  hashOracleText,
  hashOracleValue
} from "../oracle/oracle-authorization.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { runVerificationCommands } from "../verification/verification-runner.js";
import {
  loadOracleAuthorization,
  type OracleAuthorizationWorkflowOptions
} from "./oracle-authorization.workflow.js";

export type BaselineVerificationWorkflowOptions = OracleAuthorizationWorkflowOptions & {
  readonly force?: boolean;
  readonly jsonOutput?: boolean;
  readonly commandRunner?: CommandRunner;
};

export type BaselineVerificationSummary = {
  readonly success: boolean;
  readonly taskId: string;
  readonly outcome: BaselineEvidence["outcome"];
  readonly action: "executed" | "cached" | "previewed";
  readonly cacheKey: string;
  readonly reportPath: string | null;
  readonly commands: readonly {
    readonly command: string;
    readonly success: boolean;
    readonly exitCode: number | null;
    readonly skipped: boolean;
  }[];
  readonly nextCommand: string;
  readonly dryRun: boolean;
};

function observation(
  commands: readonly VerificationCommandResult[]
): "passed" | "failed" | "inconclusive" {
  const executed = commands.filter((command) => !command.skipped);
  if (executed.length === 0) return "inconclusive";
  return executed.every((command) => command.success) ? "passed" : "failed";
}

export function evaluateBaselineOracles(input: {
  readonly oracles: readonly OraclePlanOracle[];
  readonly commands: readonly VerificationCommandResult[];
}): readonly BaselineOracleResult[] {
  const observed = observation(input.commands);
  return input.oracles.map((oracle) => ({
    oracleId: oracle.id,
    expected: oracle.baseline.expected,
    observed,
    expectationMet:
      oracle.baseline.expected === "failed"
        ? observed === "failed"
        : oracle.baseline.expected === "passed"
          ? observed === "passed"
          : observed !== "inconclusive"
  }));
}

export function evaluateBaselineOutcome(
  results: readonly BaselineOracleResult[]
): BaselineEvidence["outcome"] {
  if (results.some((result) => result.observed === "inconclusive")) return "inconclusive";
  return results.every((result) => result.expectationMet) ? "passed" : "failed";
}

function summary(input: {
  readonly evidence: BaselineEvidence;
  readonly action: BaselineVerificationSummary["action"];
  readonly reportPath: string | null;
  readonly dryRun: boolean;
}): BaselineVerificationSummary {
  return {
    success: input.evidence.outcome === "passed" || input.dryRun,
    taskId: input.evidence.taskId,
    outcome: input.evidence.outcome,
    action: input.action,
    cacheKey: input.evidence.cacheKey.hash,
    reportPath: input.reportPath,
    commands: input.evidence.commands.map((command) => ({
      command: command.command,
      success: command.success,
      exitCode: command.exitCode,
      skipped: command.skipped
    })),
    nextCommand:
      input.evidence.outcome === "passed"
        ? `visp gate implement --task ${input.evidence.taskId}`
        : `visp verify --baseline --task ${input.evidence.taskId}`,
    dryRun: input.dryRun
  };
}

export async function runBaselineVerificationWorkflow(
  options: BaselineVerificationWorkflowOptions = {}
): Promise<Result<BaselineVerificationSummary, VispError>> {
  const authorization = await loadOracleAuthorization({
    ...options,
    allowMissingBaseline: true,
    allowStaleBaseline: true
  });
  if (!authorization.ok) return authorization;
  const cacheKey = await createBaselineCacheKey({
    targetPath: authorization.value.targetPath,
    plan: authorization.value.plan,
    planPath: authorization.value.planPath
  });
  if (!cacheKey.ok) return cacheKey;
  const reportAbsolutePath = baselineEvidenceArtifactPath(
    authorization.value.targetPath,
    authorization.value.featureKey,
    authorization.value.plan.taskId
  );
  const reportPath = relativePath(authorization.value.targetPath, reportAbsolutePath);
  const existing = await pathExists(reportAbsolutePath);
  if (!existing.ok) return existing;
  if (existing.value && !(options.force ?? false)) {
    const cached = await readArtifact(reportAbsolutePath, baselineEvidenceSchema, {
      artifactName: "baseline evidence"
    });
    if (
      cached.ok &&
      cached.value.taskId === authorization.value.plan.taskId &&
      cached.value.oraclePlan.path === authorization.value.planPath &&
      cached.value.oraclePlan.sha256 === hashOracleValue(authorization.value.plan) &&
      cached.value.cacheKey.hash === cacheKey.value.hash &&
      cached.value.outcome === "passed" &&
      authorization.value.lock.baselineEvidence !== undefined
    ) {
      return ok(
        summary({
          evidence: cached.value,
          action: "cached",
          reportPath: options.dryRun ? null : reportPath,
          dryRun: options.dryRun ?? false
        })
      );
    }
  }

  if (!(options.dryRun ?? false)) {
    const cleared = await clearTaskImplementMarker(
      authorization.value.targetPath,
      authorization.value.plan.taskId
    );
    if (!cleared.ok) return cleared;
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
  const oracles = evaluateBaselineOracles({
    oracles: authorization.value.plan.oracles,
    commands
  });
  const candidate = {
    version: "1.0" as const,
    id: `BASELINE-${authorization.value.plan.featureId}-${authorization.value.plan.taskId}`,
    featureId: authorization.value.plan.featureId,
    featureSlug: authorization.value.plan.featureSlug,
    taskId: authorization.value.plan.taskId,
    oraclePlan: {
      path: authorization.value.planPath,
      sha256: hashOracleValue(authorization.value.plan)
    },
    originLockHash: authorization.value.lock.lockHash,
    cacheKey: cacheKey.value,
    oracles,
    commands,
    outcome: evaluateBaselineOutcome(oracles),
    generatedAt
  };
  const parsed = baselineEvidenceSchema.safeParse(candidate);
  if (!parsed.success) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Generated baseline evidence is invalid: ${parsed.error.issues[0]?.message ?? "unknown error"}.`
      )
    );
  }
  if (options.dryRun ?? false) {
    return ok(
      summary({
        evidence: parsed.data,
        action: "previewed",
        reportPath: null,
        dryRun: true
      })
    );
  }

  const reportWrite = await writeArtifact(reportAbsolutePath, baselineEvidenceSchema, parsed.data, {
    artifactName: "baseline evidence"
  });
  if (!reportWrite.ok) return reportWrite;
  const baselineBinding = {
    path: reportPath,
    sha256: hashOracleText(`${JSON.stringify(parsed.data, null, 2)}\n`)
  };
  const lock = createOracleLock({
    plan: authorization.value.plan,
    planPath: authorization.value.planPath,
    approval: authorization.value.approval,
    approvalPath: authorization.value.approvalPath,
    baselineEvidence: baselineBinding,
    lockedAt: generatedAt,
    now: generatedAt
  });
  if (!lock.ok) return lock;
  const lockWrite = await writeArtifact(
    oracleLockArtifactPath(
      authorization.value.targetPath,
      authorization.value.featureKey,
      authorization.value.plan.taskId
    ),
    oracleLockSchema,
    lock.value,
    { artifactName: "oracle lock" }
  );
  if (!lockWrite.ok) return lockWrite;

  return ok(
    summary({
      evidence: parsed.data,
      action: "executed",
      reportPath,
      dryRun: false
    })
  );
}

export function formatBaselineVerificationSummary(value: BaselineVerificationSummary): string {
  return `${[
    formatHeader(value.success ? "Visp baseline complete" : "Visp baseline failed"),
    "",
    formatKeyValue("Task", value.taskId),
    formatKeyValue("Outcome", value.outcome),
    formatKeyValue("Action", value.action),
    formatKeyValue("Cache key", value.cacheKey),
    ...(value.reportPath === null ? [] : [formatKeyValue("Artifact", value.reportPath)]),
    "",
    "Next:",
    `  ${value.nextCommand}`
  ].join("\n")}\n`;
}
