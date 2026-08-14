import { policyArtifactPath, projectConfigArtifactPath } from "../artifacts/artifact-paths.js";
import {
  strictnessModeSchema,
  type PolicyArtifact,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { relativePath, vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { createDefaultPolicy, resolvePolicyRules } from "./policy-defaults.js";
import { validatePolicyArtifact } from "./policy-validator.js";

export type LoadedPolicy = {
  readonly policy: PolicyArtifact;
  readonly source: "file" | "default";
  readonly policyPath: string;
  readonly policyPathRelative: string;
  readonly exists: boolean;
  readonly warnings: readonly string[];
  /**
   * Rule keys absent from the stored file and supplied here from its strictness
   * preset. Non-empty means the file understates what it enforces; `visp-kit
   * policy migrate` writes them down.
   */
  readonly filledRuleKeys: readonly string[];
};

export async function ensureVispProject(targetPath: string): Promise<Result<void, VispError>> {
  const exists = await pathExists(vispDir(targetPath));

  if (!exists.ok) return exists;

  if (!exists.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp-kit init` first.")
    );
  }

  return ok(undefined);
}

export async function defaultPolicyStrictness(
  targetPath: string
): Promise<Result<StrictnessMode, VispError>> {
  const configPath = projectConfigArtifactPath(targetPath);
  const exists = await pathExists(configPath);

  if (!exists.ok) return exists;
  if (!exists.value) return ok("standard");

  const config = await readJsonFile<Record<string, unknown>>(configPath);

  if (!config.ok) return config;

  const configured = strictnessModeSchema.safeParse(config.value.strictnessMode);
  return ok(configured.success ? configured.data : "standard");
}

export async function readPolicyFile(targetPath: string): Promise<Result<LoadedPolicy, VispError>> {
  const policyPath = policyArtifactPath(targetPath);
  const raw = await readJsonFile<unknown>(policyPath);

  if (!raw.ok) return raw;

  const validation = validatePolicyArtifact(raw.value);

  if (!validation.passed || validation.value === undefined) {
    return err(
      new VispError("VALIDATION_FAILED", `Invalid policy:\n- ${validation.errors.join("\n- ")}`, {
        details: { path: policyPath, errors: validation.errors }
      })
    );
  }

  const resolved = resolvePolicyRules(validation.value.rules, validation.value.strictnessMode);

  return ok({
    policy: { ...validation.value, rules: resolved.rules },
    source: "file",
    policyPath,
    policyPathRelative: relativePath(targetPath, policyPath),
    exists: true,
    warnings:
      resolved.filledKeys.length === 0
        ? []
        : [
            `Policy file omits ${resolved.filledKeys.length} rule ${
              resolved.filledKeys.length === 1 ? "key" : "keys"
            } (${resolved.filledKeys.join(", ")}); they are being enforced at the ` +
              `${validation.value.strictnessMode} defaults. Run \`visp-kit policy migrate\` to record them.`
          ],
    filledRuleKeys: resolved.filledKeys
  });
}

/**
 * Read the stored policy artifact exactly as written, with no strictness
 * back-fill. `policy migrate` needs the literal file to know what is missing.
 */
export async function readStoredPolicyFile(
  targetPath: string
): Promise<Result<PolicyArtifact, VispError>> {
  const policyPath = policyArtifactPath(targetPath);
  const raw = await readJsonFile<unknown>(policyPath);

  if (!raw.ok) return raw;

  const validation = validatePolicyArtifact(raw.value);

  if (!validation.passed || validation.value === undefined) {
    return err(
      new VispError("VALIDATION_FAILED", `Invalid policy:\n- ${validation.errors.join("\n- ")}`, {
        details: { path: policyPath, errors: validation.errors }
      })
    );
  }

  return ok(validation.value);
}

export async function loadEffectivePolicy(input: {
  readonly targetPath: string;
  readonly now: string;
}): Promise<Result<LoadedPolicy, VispError>> {
  const initialized = await ensureVispProject(input.targetPath);

  if (!initialized.ok) return initialized;

  const policyPath = policyArtifactPath(input.targetPath);
  const exists = await pathExists(policyPath);

  if (!exists.ok) return exists;

  if (exists.value) {
    return readPolicyFile(input.targetPath);
  }

  const strictness = await defaultPolicyStrictness(input.targetPath);

  if (!strictness.ok) return strictness;

  return ok({
    policy: createDefaultPolicy({
      strictnessMode: strictness.value,
      now: input.now
    }),
    source: "default",
    policyPath,
    policyPathRelative: relativePath(input.targetPath, policyPath),
    exists: false,
    warnings: ["Policy file is missing. Run `visp-kit policy init` to persist it."],
    filledRuleKeys: []
  });
}
