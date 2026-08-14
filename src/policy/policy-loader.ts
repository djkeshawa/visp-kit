import { policyArtifactPath, projectConfigArtifactPath } from "../artifacts/artifact-paths.js";
import {
  strictnessModeSchema,
  type PolicyArtifact,
  type PolicyRules,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { relativePath, vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  createDefaultPolicy,
  describePolicyRuleKey,
  resolvePolicyRules
} from "./policy-defaults.js";
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
  /**
   * The subset of `filledRuleKeys` that resolved to `true`.
   *
   * This is the list that changes behaviour. A key back-filled to `false` costs
   * the reader nothing; a key back-filled to `true` is enforcement the file
   * never asked for, and it will surface as a blocked gate on a rule the
   * project has never heard of.
   */
  readonly enforcedFilledRuleKeys: readonly string[];
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
  const enforcedFilledKeys = resolved.filledKeys.filter((key) => resolved.rules[key] === true);

  return ok({
    policy: { ...validation.value, rules: resolved.rules },
    source: "file",
    policyPath,
    policyPathRelative: relativePath(targetPath, policyPath),
    exists: true,
    warnings: backFillWarnings({
      filledKeys: resolved.filledKeys,
      enforcedFilledKeys,
      strictnessMode: validation.value.strictnessMode
    }),
    filledRuleKeys: resolved.filledKeys,
    enforcedFilledRuleKeys: enforcedFilledKeys
  });
}

/**
 * Name what the back-fill turned on, before a gate does it for us.
 *
 * A policy file written before a rule existed validates fine and then meets
 * that rule as a blocked gate. The keys that resolved to `true` are the ones
 * that will do the blocking, so they are listed separately, by the rule id the
 * gate report will print, and the "off" ones are counted rather than named.
 */
function backFillWarnings(input: {
  readonly filledKeys: readonly (keyof PolicyRules)[];
  readonly enforcedFilledKeys: readonly (keyof PolicyRules)[];
  readonly strictnessMode: StrictnessMode;
}): readonly string[] {
  if (input.filledKeys.length === 0) return [];

  const quiet = input.filledKeys.length - input.enforcedFilledKeys.length;
  const migrate = "Run `visp-kit policy migrate` to record them.";

  if (input.enforcedFilledKeys.length === 0) {
    return [
      `Policy file omits ${input.filledKeys.length} rule ` +
        `${input.filledKeys.length === 1 ? "key" : "keys"}; all of them resolve to off at the ` +
        `${input.strictnessMode} defaults, so nothing extra is enforced. ${migrate}`
    ];
  }

  return [
    `Policy file omits ${input.filledKeys.length} rule ` +
      `${input.filledKeys.length === 1 ? "key" : "keys"}. ` +
      `${input.enforcedFilledKeys.length} of them ` +
      `${input.enforcedFilledKeys.length === 1 ? "is" : "are"} ENFORCED at the ` +
      `${input.strictnessMode} defaults and can block a gate this project has not seen before: ` +
      `${input.enforcedFilledKeys.map(describePolicyRuleKey).join(", ")}` +
      `${quiet === 0 ? "" : ` (${quiet} further omitted ${quiet === 1 ? "key resolves" : "keys resolve"} to off)`}` +
      `. ${migrate}`
  ];
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
    filledRuleKeys: [],
    enforcedFilledRuleKeys: []
  });
}
