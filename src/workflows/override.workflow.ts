import path from "node:path";

import { overridesArtifactPath } from "../artifacts/artifact-paths.js";
import { type GateStage, gateStageSchema } from "../artifacts/schemas/gate.schema.js";
import { type OverrideRecord, type OverrideScope } from "../artifacts/schemas/override.schema.js";
import { VispError, toVispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { loadProjectState } from "../orchestrator/project-state.js";
import { loadEffectivePolicy } from "../policy/policy-loader.js";
import { nonOverridableMessage } from "../overrides/non-overridable-rules.js";
import { parseOverrideExpiry, overrideExpired } from "../overrides/override-expiry.js";
import { nextOverrideId } from "../overrides/override-id.js";
import { formatOverrideSummary } from "../overrides/override-report.js";
import { normalizeOverrideReason, validateOverrideReason } from "../overrides/override-reason.js";
import { defaultNextCommand, type OverrideWorkflowSummary } from "../overrides/override-summary.js";

export type { OverrideWorkflowSummary };
import { readOverrideStore, writeOverrideStore } from "../overrides/override-store.js";
import {
  isKnownPolicyRule,
  isNonOverridableRule,
  validateOverrideArtifact
} from "../overrides/override-validator.js";

export type OverrideCreateWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly ruleId: string;
  readonly reason?: string;
  readonly scope?: OverrideScope;
  readonly feature?: string;
  readonly taskId?: string;
  readonly stage?: GateStage;
  readonly expires?: string;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type OverrideListWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly active?: boolean;
  readonly revoked?: boolean;
  readonly expired?: boolean;
  readonly ruleId?: string;
  readonly feature?: string;
  readonly taskId?: string;
  readonly now?: string;
};

export type OverrideShowWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly overrideId: string;
  readonly now?: string;
};

export type OverrideRevokeWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly overrideId: string;
  readonly reason?: string;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type OverrideValidateWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly now?: string;
};

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

function summary(input: Omit<OverrideWorkflowSummary, "overridesPath">): OverrideWorkflowSummary {
  return {
    ...input,
    overridesPath: relativePath(input.targetPath, overridesArtifactPath(input.targetPath))
  };
}

function fail(message: string): Result<never, VispError> {
  return err(new VispError("VALIDATION_FAILED", message));
}

function requireMeaningfulReason(reason: string | undefined): Result<string, VispError> {
  const errors = validateOverrideReason(reason);

  if (errors.length > 0) return fail(errors.join(" "));
  return ok(normalizeOverrideReason(reason ?? ""));
}

function materializeStatus(override: OverrideRecord, now: string): OverrideRecord {
  if (override.status === "active" && overrideExpired({ expiresAt: override.expiresAt, now })) {
    return {
      ...override,
      status: "expired"
    };
  }

  return override;
}

function stageFlag(stage: GateStage | undefined): GateStage | undefined {
  return stage === undefined ? undefined : gateStageSchema.parse(stage);
}

async function resolveScope(input: {
  readonly targetPath: string;
  readonly scope: OverrideScope;
  readonly feature?: string;
  readonly taskId?: string;
}): Promise<
  Result<
    {
      readonly featureId: string | null;
      readonly featureSlug: string | null;
      readonly taskId: string | null;
    },
    VispError
  >
> {
  if (input.scope === "feature" && input.feature === undefined) {
    return fail("Feature-scoped overrides require --feature.");
  }

  if (input.scope === "task" && (input.feature === undefined || input.taskId === undefined)) {
    return fail("Task-scoped overrides require --feature and --task.");
  }

  if (input.scope === "project") {
    return ok({
      featureId: null,
      featureSlug: null,
      taskId: null
    });
  }

  const state = await loadProjectState({
    targetPath: input.targetPath,
    feature: input.feature,
    taskId: input.taskId
  });

  if (!state.ok) return state;
  if (state.value.errors.length > 0) return fail(state.value.errors.join(" "));

  if (
    (input.scope === "feature" || input.scope === "task") &&
    state.value.selectedFeature === undefined
  ) {
    return fail(`Feature not found: ${input.feature ?? "active feature"}.`);
  }

  if (input.scope === "task" && state.value.selectedTask?.id !== input.taskId) {
    return fail(`Task not found: ${input.taskId ?? "active task"}.`);
  }

  return ok({
    featureId: state.value.selectedFeature?.id ?? null,
    featureSlug: state.value.selectedFeature?.slug ?? null,
    taskId: input.taskId ?? null
  });
}

export async function runOverrideCreateWorkflow(
  options: OverrideCreateWorkflowOptions
): Promise<Result<OverrideWorkflowSummary, VispError>> {
  try {
    const targetPath = targetPathFrom(options);
    const dryRun = options.dryRun ?? false;
    const now = options.now ?? new Date().toISOString();
    const scope = options.scope ?? "project";
    const policy = await loadEffectivePolicy({ targetPath, now });

    if (!policy.ok) return policy;

    if (!isKnownPolicyRule(options.ruleId)) {
      return fail(`Unknown policy rule ID: ${options.ruleId}.`);
    }

    const overridesPolicy = policy.value.policy.overrides;
    const lockedWithoutPermission =
      policy.value.policy.strictnessMode === "locked" && !overridesPolicy.allowedInLockedMode;

    if (!overridesPolicy.allowed || lockedWithoutPermission) {
      return fail(
        `Overrides are not allowed by the current policy (strictness: ${policy.value.policy.strictnessMode}). ` +
          "An override created now would never apply, so creation is blocked."
      );
    }

    if (isNonOverridableRule({ ruleId: options.ruleId, policy: policy.value.policy })) {
      return fail(nonOverridableMessage(options.ruleId));
    }

    if (scope === "stage" && options.stage === undefined) {
      return fail("Stage-scoped overrides require --stage.");
    }

    const reason = requireMeaningfulReason(options.reason);

    if (!reason.ok) return reason;

    const resolved = await resolveScope({
      targetPath,
      scope,
      feature: options.feature,
      taskId: options.taskId
    });

    if (!resolved.ok) return resolved;

    const store = await readOverrideStore(targetPath);

    if (!store.ok) return store;

    const expiresAt = parseOverrideExpiry(options.expires, now);
    const override: OverrideRecord = {
      id: nextOverrideId(store.value.artifact.overrides),
      ruleId: options.ruleId,
      scope,
      featureId: resolved.value.featureId,
      featureSlug: resolved.value.featureSlug,
      taskId: resolved.value.taskId,
      stage: stageFlag(options.stage),
      reason: reason.value,
      status: "active",
      createdAt: now,
      createdBy: "local-user",
      expiresAt,
      revokedAt: null,
      revokedReason: null
    };
    const artifact = {
      ...store.value.artifact,
      overrides: [...store.value.artifact.overrides, override]
    };

    const validation = validateOverrideArtifact({
      artifact,
      policy: policy.value.policy,
      now
    });

    if (!validation.passed) {
      return fail(`Invalid override:\n- ${validation.errors.join("\n- ")}`);
    }

    if (!dryRun) {
      const write = await writeOverrideStore(targetPath, artifact);
      if (!write.ok) return write;
    }

    return ok(
      summary({
        success: true,
        mode: "create",
        targetPath,
        dryRun,
        override,
        overrides: [override],
        createdFiles:
          store.value.exists || dryRun ? [] : [relativePath(targetPath, store.value.path)],
        updatedFiles:
          store.value.exists && !dryRun ? [relativePath(targetPath, store.value.path)] : [],
        warnings: [
          ...(scope === "project" && (options.feature !== undefined || options.taskId !== undefined)
            ? ["--feature and --task are ignored for project-scoped overrides."]
            : []),
          ...validation.warnings
        ],
        errors: [],
        validation,
        nextCommand: defaultNextCommand({ scope, stage: options.stage, taskId: options.taskId })
      })
    );
  } catch (error) {
    return err(toVispError(error, "VALIDATION_FAILED"));
  }
}

function filterOverrides(input: {
  readonly overrides: readonly OverrideRecord[];
  readonly options: OverrideListWorkflowOptions;
  readonly now: string;
}): readonly OverrideRecord[] {
  const wantsAnyStatus = input.options.active || input.options.revoked || input.options.expired;

  return input.overrides
    .map((override) => materializeStatus(override, input.now))
    .filter((override) => {
      if (!wantsAnyStatus) return override.status === "active";
      return (
        (input.options.active && override.status === "active") ||
        (input.options.revoked && override.status === "revoked") ||
        (input.options.expired && override.status === "expired")
      );
    })
    .filter(
      (override) => input.options.ruleId === undefined || override.ruleId === input.options.ruleId
    )
    .filter(
      (override) =>
        input.options.feature === undefined ||
        override.featureId === input.options.feature ||
        override.featureSlug === input.options.feature
    )
    .filter(
      (override) => input.options.taskId === undefined || override.taskId === input.options.taskId
    );
}

export async function runOverrideListWorkflow(
  options: OverrideListWorkflowOptions = {}
): Promise<Result<OverrideWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const store = await readOverrideStore(targetPath);

  if (!store.ok) return store;

  const overrides = filterOverrides({
    overrides: store.value.artifact.overrides,
    options,
    now
  });

  return ok(
    summary({
      success: true,
      mode: "list",
      targetPath,
      dryRun: false,
      override: null,
      overrides,
      createdFiles: [],
      updatedFiles: [],
      warnings: store.value.exists ? [] : ["No overrides file found."],
      errors: [],
      validation: null,
      nextCommand: "visp-kit override validate"
    })
  );
}

export async function runOverrideShowWorkflow(
  options: OverrideShowWorkflowOptions
): Promise<Result<OverrideWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const store = await readOverrideStore(targetPath);

  if (!store.ok) return store;

  const override = store.value.artifact.overrides.find((item) => item.id === options.overrideId);

  if (override === undefined) return fail(`Override not found: ${options.overrideId}.`);

  const materialized = materializeStatus(override, now);

  return ok(
    summary({
      success: true,
      mode: "show",
      targetPath,
      dryRun: false,
      override: materialized,
      overrides: [materialized],
      createdFiles: [],
      updatedFiles: [],
      warnings: [],
      errors: [],
      validation: null,
      nextCommand: "visp-kit override list"
    })
  );
}

export async function runOverrideRevokeWorkflow(
  options: OverrideRevokeWorkflowOptions
): Promise<Result<OverrideWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const reason = requireMeaningfulReason(options.reason);

  if (!reason.ok) return reason;

  const store = await readOverrideStore(targetPath);

  if (!store.ok) return store;

  const existing = store.value.artifact.overrides.find((item) => item.id === options.overrideId);

  if (existing === undefined) return fail(`Override not found: ${options.overrideId}.`);

  if (existing.status === "revoked") {
    return ok(
      summary({
        success: true,
        mode: "revoke",
        targetPath,
        dryRun,
        override: existing,
        overrides: [existing],
        createdFiles: [],
        updatedFiles: [],
        warnings: [`${existing.id} is already revoked.`],
        errors: [],
        validation: null,
        nextCommand: "visp-kit override list --revoked"
      })
    );
  }

  const revoked: OverrideRecord = {
    ...existing,
    status: "revoked",
    revokedAt: now,
    revokedReason: reason.value
  };
  const artifact = {
    ...store.value.artifact,
    overrides: store.value.artifact.overrides.map((item) =>
      item.id === existing.id ? revoked : item
    )
  };

  if (!dryRun) {
    const write = await writeOverrideStore(targetPath, artifact);
    if (!write.ok) return write;
  }

  return ok(
    summary({
      success: true,
      mode: "revoke",
      targetPath,
      dryRun,
      override: revoked,
      overrides: [revoked],
      createdFiles: [],
      updatedFiles: dryRun ? [] : [relativePath(targetPath, overridesArtifactPath(targetPath))],
      warnings: [],
      errors: [],
      validation: null,
      nextCommand: "visp-kit override validate"
    })
  );
}

export async function runOverrideValidateWorkflow(
  options: OverrideValidateWorkflowOptions = {}
): Promise<Result<OverrideWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const policy = await loadEffectivePolicy({ targetPath, now });

  if (!policy.ok) return policy;

  const store = await readOverrideStore(targetPath);

  if (!store.ok) return store;

  const validation = validateOverrideArtifact({
    artifact: store.value.artifact,
    policy: policy.value.policy,
    now
  });
  const overrides = store.value.artifact.overrides.map((override) =>
    materializeStatus(override, now)
  );

  return ok(
    summary({
      success: validation.passed,
      mode: "validate",
      targetPath,
      dryRun: false,
      override: null,
      overrides,
      createdFiles: [],
      updatedFiles: [],
      warnings: [
        ...(store.value.exists ? [] : ["No overrides file found."]),
        ...validation.warnings
      ],
      errors: validation.errors,
      validation,
      nextCommand: validation.passed
        ? "visp-kit override list"
        : "Fix .visp/overrides.json and rerun visp-kit override validate."
    })
  );
}

export { formatOverrideSummary };
