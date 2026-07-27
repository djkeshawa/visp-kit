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
    /** Active overrides with no expiry — permanent exemptions, not break-glass. */
    readonly perpetual: number;
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
  // Union the policy file's list with the protected defaults so the
  // non-overridable core (VSP019/VSP020) stays protected even if the policy
  // artifact's array has been tampered with to omit them.
  const rules = new Set<string>([
    ...defaultNonOverridableRules,
    ...(input.policy?.overrides.nonOverridableRules ?? [])
  ]);
  return rules.has(input.ruleId);
}

function scopeErrors(override: OverrideRecord): readonly string[] {
  if (
    override.scope === "feature" &&
    (override.featureId === undefined ||
      override.featureId === null ||
      override.featureSlug === undefined ||
      override.featureSlug === null)
  ) {
    return [`${override.id}: feature scope requires featureId and featureSlug.`];
  }

  if (
    override.scope === "task" &&
    (override.featureId === undefined ||
      override.featureId === null ||
      override.featureSlug === undefined ||
      override.featureSlug === null ||
      override.taskId === undefined ||
      override.taskId === null)
  ) {
    return [`${override.id}: task scope requires feature and taskId.`];
  }

  if (override.scope === "stage" && (override.stage === undefined || override.stage === null)) {
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
  let perpetual = 0;

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

    if (
      override.status === "active" &&
      overrideExpired({ expiresAt: override.expiresAt, now: input.now })
    ) {
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

    // An override with no expiry is not break-glass; it is a permanent
    // exemption that never comes back for review. Nothing previously said so —
    // the expiry checks only asked whether a deadline had passed, never
    // whether one had been set — so the quietest way to switch a rule off
    // forever was to omit the field.
    if (
      override.status === "active" &&
      (override.expiresAt === undefined || override.expiresAt === null)
    ) {
      perpetual += 1;

      // Deliberately a warning in every mode, including strict and locked.
      //
      // Blocking here was the first instinct and it is wrong: some exemptions
      // are legitimately permanent — a rule that cannot apply to this
      // repository at all — and there is currently no way to say so. Erroring
      // would leave those projects with no correct move, since revoking the
      // override removes an exemption they actually need.
      //
      // The gap this closes is that nothing *said* anything: the expiry checks
      // only asked whether a deadline had passed, never whether one had been
      // set, so the quietest way to switch a rule off forever was to omit the
      // field. Naming it is the fix available today. Enforcing it needs an
      // explicit way to declare permanence, so that a forgotten expiry and an
      // intentional one stop looking identical.
      warnings.push(
        `${override.id}: active override of ${override.ruleId} has no expiry, so it never ` +
          `returns for review. Set expiresAt if this is temporary.`
      );
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    counts: {
      active,
      revoked,
      expired,
      perpetual
    }
  };
}
