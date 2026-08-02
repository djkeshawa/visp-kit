import path from "node:path";

import {
  baselineEvidenceArtifactPath,
  oracleApprovalArtifactPath,
  oracleLockArtifactPath,
  oraclePlanArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  baselineEvidenceSchema,
  type BaselineEvidence
} from "../artifacts/schemas/baseline-evidence.schema.js";
import {
  oracleApprovalSchema,
  oracleLockSchema,
  type OracleApproval,
  type OracleAuthorizationBinding,
  type OracleLock
} from "../artifacts/schemas/oracle-authorization.schema.js";
import { oraclePlanSchema, type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readTextFile, removeFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { createBaselineCacheKey } from "../evidence/baseline-cache-key.js";
import { providerRunsMatchRequirements, providerRunsPass } from "../evidence/provider-registry.js";
import {
  createOracleApproval,
  createOracleLock,
  hashOracleText,
  hashOracleValue,
  revokeOracleApproval,
  validateOracleLock
} from "../oracle/oracle-authorization.js";
import { clearTaskImplementMarker } from "../gates/implement-marker.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { runOracleValidateWorkflow } from "./oracle.workflow.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
import {
  writeGeneratedFiles,
  writeUpdatedGeneratedFiles,
  type WorkflowFileAction
} from "./shared/generated-files.js";
import { artifactGeneratedFile } from "./shared/template-workflow.js";

export type OracleAuthorizationWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly now?: string;
  readonly dryRun?: boolean;
  readonly allowMissingBaseline?: boolean;
  readonly allowStaleBaseline?: boolean;
};

export type OracleApproveWorkflowOptions = OracleAuthorizationWorkflowOptions & {
  readonly reviewerId?: string;
  readonly reason?: string;
  readonly expiresAt?: string;
  readonly force?: boolean;
};

export type OracleRevokeWorkflowOptions = OracleAuthorizationWorkflowOptions & {
  readonly reason?: string;
};

export type OracleAuthorizationWorkflowSummary = {
  readonly success: true;
  readonly taskId: string;
  readonly operation: "approved" | "revoked" | "locked";
  readonly assuranceProfile: OraclePlan["assuranceProfile"];
  readonly artifactPath: string;
  readonly action: WorkflowFileAction["action"];
  readonly lockHash?: string;
  readonly dryRun: boolean;
  readonly nextCommand: string;
};

export type LoadedOracleAuthorization = {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly approval?: OracleApproval;
  readonly approvalPath?: string;
  readonly lock: OracleLock;
  readonly baselineEvidence?: BaselineEvidence;
  readonly binding: OracleAuthorizationBinding;
};

function required(value: string | undefined, label: string): Result<string, VispError> {
  if (value === undefined || value.trim().length === 0) {
    return err(new VispError("VALIDATION_FAILED", `Oracle command requires ${label}.`));
  }
  return ok(value.trim());
}

async function invalidateImplementationAuthorization(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId: string;
}): Promise<Result<void, VispError>> {
  const lockRemoved = await removeFile(
    oracleLockArtifactPath(input.targetPath, input.featureKey, input.taskId)
  );
  if (!lockRemoved.ok) return lockRemoved;
  return clearTaskImplementMarker(input.targetPath, input.taskId);
}

async function loadCurrentPlan(options: OracleAuthorizationWorkflowOptions): Promise<
  Result<
    {
      readonly targetPath: string;
      readonly featureKey: string;
      readonly plan: OraclePlan;
      readonly planPath: string;
    },
    VispError
  >
> {
  const taskId = required(options.taskId, "--task <task-id>");
  if (!taskId.ok) return taskId;
  const validated = await runOracleValidateWorkflow(options);
  if (!validated.ok) return validated;

  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const feature = await resolveActiveFeature({ targetPath, feature: options.feature });
  if (!feature.ok) return feature;
  const absolutePlanPath = oraclePlanArtifactPath(targetPath, feature.value.key, taskId.value);
  const plan = await readArtifact(absolutePlanPath, oraclePlanSchema, {
    artifactName: "oracle plan"
  });
  if (!plan.ok) return plan;

  return ok({
    targetPath,
    featureKey: feature.value.key,
    plan: plan.value,
    planPath: relativePath(targetPath, absolutePlanPath)
  });
}

export async function runOracleApproveWorkflow(
  options: OracleApproveWorkflowOptions = {}
): Promise<Result<OracleAuthorizationWorkflowSummary, VispError>> {
  const reviewerId = required(options.reviewerId, "--reviewer <reviewer-id>");
  if (!reviewerId.ok) return reviewerId;
  const reason = required(options.reason, "--reason <reason>");
  if (!reason.ok) return reason;
  const loaded = await loadCurrentPlan(options);
  if (!loaded.ok) return loaded;
  const approval = createOracleApproval({
    plan: loaded.value.plan,
    planPath: loaded.value.planPath,
    reviewerId: reviewerId.value,
    reason: reason.value,
    approvedAt: options.now ?? new Date().toISOString(),
    expiresAt: options.expiresAt
  });
  if (!approval.ok) return approval;
  const artifactPath = oracleApprovalArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  const existing = await pathExists(artifactPath);
  if (!existing.ok) return existing;
  if (!(options.dryRun ?? false) && (!existing.value || (options.force ?? false))) {
    const invalidated = await invalidateImplementationAuthorization({
      targetPath: loaded.value.targetPath,
      featureKey: loaded.value.featureKey,
      taskId: loaded.value.plan.taskId
    });
    if (!invalidated.ok) return invalidated;
  }
  const written = await writeGeneratedFiles(
    [
      artifactGeneratedFile({
        targetPath: loaded.value.targetPath,
        path: artifactPath,
        artifactName: "oracle approval",
        schema: oracleApprovalSchema,
        value: approval.value
      })
    ],
    { force: options.force ?? false, dryRun: options.dryRun ?? false }
  );
  if (!written.ok) return written;

  return ok({
    success: true,
    taskId: loaded.value.plan.taskId,
    operation: "approved",
    assuranceProfile: loaded.value.plan.assuranceProfile,
    artifactPath: relativePath(loaded.value.targetPath, artifactPath),
    action: written.value[0]?.action ?? "created",
    dryRun: options.dryRun ?? false,
    nextCommand: `visp-kit oracle lock --task ${loaded.value.plan.taskId}`
  });
}

export async function runOracleRevokeWorkflow(
  options: OracleRevokeWorkflowOptions = {}
): Promise<Result<OracleAuthorizationWorkflowSummary, VispError>> {
  const reason = required(options.reason, "--reason <reason>");
  if (!reason.ok) return reason;
  const loaded = await loadCurrentPlan(options);
  if (!loaded.ok) return loaded;
  const artifactPath = oracleApprovalArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  const approval = await readArtifact(artifactPath, oracleApprovalSchema, {
    artifactName: "oracle approval"
  });
  if (!approval.ok) return approval;
  const revoked = revokeOracleApproval({
    approval: approval.value,
    revokedAt: options.now ?? new Date().toISOString(),
    reason: reason.value
  });
  if (!revoked.ok) return revoked;
  if (!(options.dryRun ?? false)) {
    const invalidated = await invalidateImplementationAuthorization({
      targetPath: loaded.value.targetPath,
      featureKey: loaded.value.featureKey,
      taskId: loaded.value.plan.taskId
    });
    if (!invalidated.ok) return invalidated;
  }
  const written = await writeUpdatedGeneratedFiles(
    [
      artifactGeneratedFile({
        targetPath: loaded.value.targetPath,
        path: artifactPath,
        artifactName: "oracle approval",
        schema: oracleApprovalSchema,
        value: revoked.value
      })
    ],
    { dryRun: options.dryRun ?? false }
  );
  if (!written.ok) return written;

  return ok({
    success: true,
    taskId: loaded.value.plan.taskId,
    operation: "revoked",
    assuranceProfile: loaded.value.plan.assuranceProfile,
    artifactPath: relativePath(loaded.value.targetPath, artifactPath),
    action: written.value[0]?.action ?? "updated",
    dryRun: options.dryRun ?? false,
    nextCommand: `visp-kit oracle approve --task ${loaded.value.plan.taskId} --reviewer <id> --reason <reason>`
  });
}

export async function runOracleLockWorkflow(
  options: OracleAuthorizationWorkflowOptions = {}
): Promise<Result<OracleAuthorizationWorkflowSummary, VispError>> {
  const loaded = await loadCurrentPlan(options);
  if (!loaded.ok) return loaded;
  const approvalAbsolutePath = oracleApprovalArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  let approval: OracleApproval | undefined;
  let approvalPath: string | undefined;
  if (loaded.value.plan.assuranceProfile === "critical") {
    const read = await readArtifact(approvalAbsolutePath, oracleApprovalSchema, {
      artifactName: "oracle approval"
    });
    if (!read.ok) return read;
    approval = read.value;
    approvalPath = relativePath(loaded.value.targetPath, approvalAbsolutePath);
  }
  const baselineAbsolutePath = baselineEvidenceArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  let baselineEvidence: OracleLock["baselineEvidence"];
  const baselineExists = await pathExists(baselineAbsolutePath);
  if (!baselineExists.ok) return baselineExists;
  if (baselineExists.value) {
    const baseline = await readArtifact(baselineAbsolutePath, baselineEvidenceSchema, {
      artifactName: "baseline evidence"
    });
    const rawBaseline = await readTextFile(baselineAbsolutePath);
    if (
      baseline.ok &&
      rawBaseline.ok &&
      baseline.value.taskId === loaded.value.plan.taskId &&
      baseline.value.outcome === "passed" &&
      baseline.value.oraclePlan.sha256 === hashOracleValue(loaded.value.plan) &&
      providerRunsPass(baseline.value.providerRuns) &&
      providerRunsMatchRequirements(
        baseline.value.providerRuns,
        loaded.value.plan.requiredProviders
      )
    ) {
      baselineEvidence = {
        path: relativePath(loaded.value.targetPath, baselineAbsolutePath),
        sha256: hashOracleText(rawBaseline.value)
      };
    }
  }
  const lock = createOracleLock({
    plan: loaded.value.plan,
    planPath: loaded.value.planPath,
    approval,
    approvalPath,
    baselineEvidence,
    lockedAt: options.now ?? new Date().toISOString()
  });
  if (!lock.ok) return lock;
  const artifactPath = oracleLockArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  const written = await writeUpdatedGeneratedFiles(
    [
      artifactGeneratedFile({
        targetPath: loaded.value.targetPath,
        path: artifactPath,
        artifactName: "oracle lock",
        schema: oracleLockSchema,
        value: lock.value
      })
    ],
    { dryRun: options.dryRun ?? false }
  );
  if (!written.ok) return written;

  return ok({
    success: true,
    taskId: loaded.value.plan.taskId,
    operation: "locked",
    assuranceProfile: loaded.value.plan.assuranceProfile,
    artifactPath: relativePath(loaded.value.targetPath, artifactPath),
    action: written.value[0]?.action ?? "updated",
    lockHash: lock.value.lockHash,
    dryRun: options.dryRun ?? false,
    nextCommand:
      baselineEvidence === undefined
        ? `visp-kit verify --baseline --task ${loaded.value.plan.taskId}`
        : `visp-kit gate implement --task ${loaded.value.plan.taskId}`
  });
}

export async function loadOracleAuthorization(
  options: OracleAuthorizationWorkflowOptions = {}
): Promise<Result<LoadedOracleAuthorization, VispError>> {
  const loaded = await loadCurrentPlan(options);
  if (!loaded.ok) return loaded;
  const lockAbsolutePath = oracleLockArtifactPath(
    loaded.value.targetPath,
    loaded.value.featureKey,
    loaded.value.plan.taskId
  );
  const lock = await readArtifact(lockAbsolutePath, oracleLockSchema, {
    artifactName: "oracle lock"
  });
  if (!lock.ok) return lock;

  let baselineEvidence: BaselineEvidence | undefined;
  if (lock.value.baselineEvidence !== undefined) {
    const baselineAbsolutePath = baselineEvidenceArtifactPath(
      loaded.value.targetPath,
      loaded.value.featureKey,
      loaded.value.plan.taskId
    );
    const expectedPath = relativePath(loaded.value.targetPath, baselineAbsolutePath);
    if (lock.value.baselineEvidence.path !== expectedPath) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Oracle lock baseline path is invalid for task ${loaded.value.plan.taskId}.`
        )
      );
    }
    const rawBaseline = await readTextFile(baselineAbsolutePath);
    if (!rawBaseline.ok) return rawBaseline;
    if (hashOracleText(rawBaseline.value) !== lock.value.baselineEvidence.sha256) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Baseline evidence changed after oracle locking for task ${loaded.value.plan.taskId}.`
        )
      );
    }
    const baseline = await readArtifact(baselineAbsolutePath, baselineEvidenceSchema, {
      artifactName: "baseline evidence"
    });
    if (!baseline.ok) return baseline;
    if (
      baseline.value.taskId !== loaded.value.plan.taskId ||
      baseline.value.oraclePlan.path !== loaded.value.planPath ||
      baseline.value.oraclePlan.sha256 !== hashOracleValue(loaded.value.plan) ||
      baseline.value.outcome !== "passed" ||
      !providerRunsPass(baseline.value.providerRuns) ||
      !providerRunsMatchRequirements(
        baseline.value.providerRuns,
        loaded.value.plan.requiredProviders
      )
    ) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Baseline evidence is stale or insufficient for task ${loaded.value.plan.taskId}.`
        )
      );
    }
    const currentCacheKey = await createBaselineCacheKey({
      targetPath: loaded.value.targetPath,
      plan: loaded.value.plan,
      planPath: loaded.value.planPath
    });
    if (!currentCacheKey.ok) return currentCacheKey;
    if (
      baseline.value.cacheKey.hash !== currentCacheKey.value.hash &&
      !(options.allowStaleBaseline ?? false)
    ) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Baseline cache inputs changed for task ${loaded.value.plan.taskId}. Run \`visp-kit verify --baseline --task ${loaded.value.plan.taskId}\`.`
        )
      );
    }
    baselineEvidence = baseline.value;
  } else if (!(options.allowMissingBaseline ?? false)) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Baseline evidence is not locked for task ${loaded.value.plan.taskId}. Run \`visp-kit verify --baseline --task ${loaded.value.plan.taskId}\`.`
      )
    );
  }

  let approval: OracleApproval | undefined;
  let approvalPath: string | undefined;
  if (loaded.value.plan.assuranceProfile === "critical") {
    const approvalAbsolutePath = oracleApprovalArtifactPath(
      loaded.value.targetPath,
      loaded.value.featureKey,
      loaded.value.plan.taskId
    );
    const read = await readArtifact(approvalAbsolutePath, oracleApprovalSchema, {
      artifactName: "oracle approval"
    });
    if (!read.ok) return read;
    approval = read.value;
    approvalPath = relativePath(loaded.value.targetPath, approvalAbsolutePath);
  }
  const validated = validateOracleLock({
    lock: lock.value,
    plan: loaded.value.plan,
    planPath: loaded.value.planPath,
    approval,
    approvalPath,
    now: options.now ?? new Date().toISOString()
  });
  if (!validated.ok) return validated;
  const rawLock = await readTextFile(lockAbsolutePath);
  if (!rawLock.ok) return rawLock;

  return ok({
    ...loaded.value,
    approval,
    approvalPath,
    lock: validated.value,
    baselineEvidence,
    binding: {
      lockPath: relativePath(loaded.value.targetPath, lockAbsolutePath),
      lockHash: validated.value.lockHash,
      lockFileSha256: hashOracleText(rawLock.value)
    }
  });
}

export async function oraclePlanExists(
  options: OracleAuthorizationWorkflowOptions = {}
): Promise<Result<boolean, VispError>> {
  const taskId = required(options.taskId, "--task <task-id>");
  if (!taskId.ok) return taskId;
  const targetPath = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const feature = await resolveActiveFeature({ targetPath, feature: options.feature });
  if (!feature.ok) return feature;
  return pathExists(oraclePlanArtifactPath(targetPath, feature.value.key, taskId.value));
}

export function formatOracleAuthorizationSummary(
  value: OracleAuthorizationWorkflowSummary
): string {
  return `${[
    formatHeader(`Visp oracle ${value.operation}`),
    "",
    formatKeyValue("Task", value.taskId),
    formatKeyValue("Assurance", value.assuranceProfile),
    formatKeyValue("Artifact", value.artifactPath),
    formatKeyValue("Action", value.action),
    ...(value.lockHash === undefined ? [] : [formatKeyValue("Lock", value.lockHash)]),
    "",
    "Next:",
    `  ${value.nextCommand}`
  ].join("\n")}\n`;
}
