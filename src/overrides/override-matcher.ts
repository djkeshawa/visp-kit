import {
  type OverrideArtifact,
  type OverrideRecord
} from "../artifacts/schemas/override.schema.js";
import {
  type GateRuleFinding,
  type GateStage
} from "../artifacts/schemas/gate.schema.js";
import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { overrideExpired } from "./override-expiry.js";
import { isNonOverridableRule } from "./override-validator.js";

export type AppliedOverride = {
  readonly overrideId: string;
  readonly ruleId: string;
  readonly scope: OverrideRecord["scope"];
  readonly reason: string;
  readonly expiresAt: string | null;
  readonly appliedToStage: GateStage;
  readonly appliedToFeatureId: string | null;
  readonly appliedToTaskId: string | null;
};

function featureMatches(override: OverrideRecord, state: ProjectState): boolean {
  const feature = state.selectedFeature;

  if (override.featureId === undefined && override.featureSlug === undefined) return true;
  if (feature === undefined) return false;

  return (
    override.featureId === undefined ||
    override.featureId === null ||
    override.featureId === feature.id
  ) && (
    override.featureSlug === undefined ||
    override.featureSlug === null ||
    override.featureSlug === feature.slug ||
    override.featureSlug === feature.key
  );
}

function taskMatches(override: OverrideRecord, state: ProjectState): boolean {
  if (override.taskId === undefined || override.taskId === null) return true;
  return state.selectedTask?.id === override.taskId;
}

function scopeMatches(input: {
  readonly override: OverrideRecord;
  readonly stage: GateStage;
  readonly state: ProjectState;
}): boolean {
  const { override, stage, state } = input;

  if (override.scope === "project") return true;
  if (override.scope === "feature") return featureMatches(override, state);
  if (override.scope === "task") return featureMatches(override, state) && taskMatches(override, state);
  if (override.scope === "stage") {
    return override.stage === stage &&
      featureMatches(override, state) &&
      taskMatches(override, state);
  }

  return false;
}

function canApply(input: {
  readonly override: OverrideRecord;
  readonly rule: GateRuleFinding;
  readonly policy: PolicyArtifact;
  readonly now: string;
}): boolean {
  if (!input.policy.overrides.allowed) return false;
  if (input.policy.strictnessMode === "locked" && !input.policy.overrides.allowedInLockedMode) {
    return false;
  }
  if (isNonOverridableRule({ ruleId: input.rule.ruleId, policy: input.policy })) {
    return false;
  }
  if (input.override.status !== "active") return false;
  if (input.override.ruleId !== input.rule.ruleId) return false;
  return !overrideExpired({ expiresAt: input.override.expiresAt, now: input.now });
}

export function findApplicableOverride(input: {
  readonly rule: GateRuleFinding;
  readonly stage: GateStage;
  readonly state: ProjectState;
  readonly policy: PolicyArtifact;
  readonly overrides: OverrideArtifact;
  readonly now: string;
}): AppliedOverride | undefined {
  const override = input.overrides.overrides.find((item) =>
    canApply({
      override: item,
      rule: input.rule,
      policy: input.policy,
      now: input.now
    }) &&
      scopeMatches({
        override: item,
        stage: input.stage,
        state: input.state
      })
  );

  if (override === undefined) return undefined;

  return {
    overrideId: override.id,
    ruleId: override.ruleId,
    scope: override.scope,
    reason: override.reason,
    expiresAt: override.expiresAt ?? null,
    appliedToStage: input.stage,
    appliedToFeatureId: input.state.selectedFeature?.id ?? null,
    appliedToTaskId: input.state.selectedTask?.id ?? null
  };
}
