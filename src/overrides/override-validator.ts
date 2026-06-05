import {
  type OverrideArtifact,
  type OverrideRecord
} from "../artifacts/schemas/override.schema.js";
import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";
import { policyRuleDefinitions } from "../policy/policy-defaults.js";
import { overrideExpired } from "./override-expiry.js";
import { defaultNonOverridableRules } from "./non-overridable-rules.js";
import { validateOverrideReason } from "./override-reason.js";

export type OverrideValidation = {
  readonly passed: boolean;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly counts: {
    readonly active: number;
    readonly revoked: number;
    readonly expired: number;
  };
};

const knownRuleIds = new Set(policyRuleDefinitions.map((rule) => rule.id));

export function isKnownPolicyRule(ruleId: string): boolean {
  return knownRuleIds.has(ruleId);
}

export function isNonOverridableRule(input: {
  readonly ruleId: string;
  readonly policy?: PolicyArtifact;
}): boolean {
  const rules: readonly string[] =
    input.policy?.overrides.nonOverridableRules ?? defaultNonOverridableRules;
  return rules.includes(input.ruleId);
}

function scopeErrors(override: OverrideRecord): readonly string[] {
  if (override.scope === "feature" && (
    override.featureId === undefined ||
    override.featureId === null ||
    override.featureSlug === undefined ||
    override.featureSlug === null
  )) {
    return [`${override.id}: feature scope requires featureId and featureSlug.`];
  }

  if (override.scope === "task" && (
    override.featureId === undefined ||
    override.featureId === null ||
    override.featureSlug === undefined ||
    override.featureSlug === null ||
    override.taskId === undefined ||
    override.taskId === null
  )) {
    return [`${override.id}: task scope requires feature and taskId.`];
  }

  if (override.scope === "stage" && (
    override.stage === undefined ||
    override.stage === null
  )) {
    return [`${override.id}: stage scope requires stage.`];
  }

  return [];
}

export function validateOverrideArtifact(input: {
  readonly artifact: OverrideArtifact;
  readonly policy?: PolicyArtifact;
  readonly now: string;
}): OverrideValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let active = 0;
  let revoked = 0;
  let expired = 0;

  for (const override of input.artifact.overrides) {
    if (override.status === "revoked") revoked += 1;
    if (override.status === "active") active += 1;
    if (overrideExpired({ expiresAt: override.expiresAt, now: input.now })) expired += 1;

    if (!isKnownPolicyRule(override.ruleId)) {
      errors.push(`${override.id}: unknown policy rule ${override.ruleId}.`);
    }

    if (isNonOverridableRule({ ruleId: override.ruleId, policy: input.policy })) {
      errors.push(`${override.id}: ${override.ruleId} is non-overridable.`);
    }

    errors.push(...scopeErrors(override));

    const reasonErrors = validateOverrideReason(override.reason);
    if (reasonErrors.length > 0) {
      errors.push(`${override.id}: ${reasonErrors.join(" ")}`);
    }

    if (override.status === "active" && overrideExpired({ expiresAt: override.expiresAt, now: input.now })) {
      warnings.push(`${override.id}: override has expired and will not apply.`);
    }

    if (
      input.policy?.strictnessMode === "locked" &&
      input.policy.overrides.allowedInLockedMode !== true &&
      override.status === "active" &&
      !overrideExpired({ expiresAt: override.expiresAt, now: input.now })
    ) {
      warnings.push(`${override.id}: locked mode disallows active overrides.`);
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    counts: {
      active,
      revoked,
      expired
    }
  };
}
