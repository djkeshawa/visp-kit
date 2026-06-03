import {
  policyArtifactPath
} from "../artifacts/artifact-paths.js";
import {
  type PolicyArtifact,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { pathExists } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";
import { createDefaultPolicy } from "../policy/policy-defaults.js";
import {
  defaultPolicyStrictness,
  readPolicyFile
} from "../policy/policy-loader.js";

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
    warnings.push("Visp Kit is not initialized. Run `visp init` first.");
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
    warnings.push("Policy file is missing. Run `visp policy init` to persist it.");
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

  warnings.push(`Runtime strictness override active: ${input.strictness}.`);
  return {
    initialized: true,
    policy: createDefaultPolicy({
      strictnessMode: input.strictness,
      now: input.now
    }),
    policyExists: true,
    policyValid: true,
    policySource: "file",
    warnings,
    errors
  };
}
