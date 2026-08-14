import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import { type PolicyArtifact, type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { pathExists } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";
import {
  createDefaultPolicy,
  raisePolicyStrictness,
  strictnessRank
} from "../policy/policy-defaults.js";
import { defaultPolicyStrictness, readPolicyFile } from "../policy/policy-loader.js";

export type EffectiveGatePolicy = {
  readonly initialized: boolean;
  readonly policy: PolicyArtifact;
  readonly policyExists: boolean;
  readonly policyValid: boolean;
  readonly policySource: "file" | "default";
  readonly warnings: readonly string[];
  readonly errors: readonly string[];
};

export async function loadEffectiveGatePolicy(input: {
  readonly targetPath: string;
  readonly now: string;
  readonly strictness?: StrictnessMode;
}): Promise<EffectiveGatePolicy> {
  const warnings: string[] = [];
  const errors: string[] = [];
  const initialized = await pathExists(vispDir(input.targetPath));

  if (!initialized.ok || !initialized.value) {
    warnings.push("Visp Kit is not initialized. Run `visp-kit init` first.");
    return {
      initialized: false,
      policy: createDefaultPolicy({
        strictnessMode: input.strictness ?? "standard",
        now: input.now
      }),
      policyExists: false,
      policyValid: true,
      policySource: "default",
      warnings,
      errors
    };
  }

  const policyPath = policyArtifactPath(input.targetPath);
  const policyExists = await pathExists(policyPath);
  const configuredStrictness = await defaultPolicyStrictness(input.targetPath);
  const baseStrictness =
    input.strictness ?? (configuredStrictness.ok ? configuredStrictness.value : "standard");

  if (!policyExists.ok || !policyExists.value) {
    warnings.push("Policy file is missing. Run `visp-kit policy init` to persist it.");
    return {
      initialized: true,
      policy: createDefaultPolicy({
        strictnessMode: input.strictness ?? baseStrictness,
        now: input.now
      }),
      policyExists: false,
      policyValid: true,
      policySource: "default",
      warnings,
      errors
    };
  }

  const loaded = await readPolicyFile(input.targetPath);

  if (!loaded.ok) {
    errors.push(loaded.error.message);
    return {
      initialized: true,
      policy: createDefaultPolicy({
        strictnessMode: input.strictness ?? baseStrictness,
        now: input.now
      }),
      policyExists: true,
      policyValid: false,
      policySource: "default",
      warnings,
      errors
    };
  }

  // The loader's back-fill warning has to reach the gate, because the gate is
  // where the back-fill is felt. A policy file written before VSP024 existed
  // loads clean, passes `policy validate`, and then fails the PR gate on a rule
  // the file has never mentioned. `status` printed the warning and the gate did
  // not, so the one command that blocks was the one command that did not say
  // why the rule was in force.
  warnings.push(...loaded.value.warnings);

  if (input.strictness === undefined) {
    return {
      initialized: true,
      policy: loaded.value.policy,
      policyExists: true,
      policyValid: true,
      policySource: "file",
      warnings,
      errors
    };
  }

  // A runtime override may only raise strictness. Lowering it would let a
  // single CLI flag void the policy file — including the non-overridable
  // VSP023/VSP024 rules that the override system deliberately refuses to
  // touch — with no reason, no audit record, and no overrides.json entry.
  // Lowering must go through the policy file, which is reviewable.
  if (strictnessRank(input.strictness) < strictnessRank(loaded.value.policy.strictnessMode)) {
    errors.push(
      `Runtime strictness ${input.strictness} is lower than the project policy ` +
        `${loaded.value.policy.strictnessMode}. A runtime override cannot weaken policy; ` +
        `change .visp/policy.json (visp-kit policy set-strictness ${input.strictness}) instead.`
    );
    return {
      initialized: true,
      policy: loaded.value.policy,
      policyExists: true,
      policyValid: false,
      policySource: "file",
      warnings,
      errors
    };
  }

  warnings.push(`Runtime strictness override active: ${input.strictness}.`);
  return {
    initialized: true,
    policy: raisePolicyStrictness({
      policy: loaded.value.policy,
      mode: input.strictness,
      now: input.now
    }),
    policyExists: true,
    policyValid: true,
    policySource: "file",
    warnings,
    errors
  };
}
