import { policyArtifactPath } from "../artifacts/artifact-paths.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  policyArtifactSchema,
  type PolicyArtifact,
  type StrictnessMode
} from "../artifacts/schemas/policy.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  createDefaultPolicy,
  policyRulesForStrictness,
  resolvePolicyRules
} from "../policy/policy-defaults.js";
import {
  defaultPolicyStrictness,
  ensureVispProject,
  loadEffectivePolicy,
  readPolicyFile,
  readStoredPolicyFile
} from "../policy/policy-loader.js";
import { formatPolicySummary, type PolicyRenderSummary } from "../policy/policy-renderer.js";
import { validatePolicyArtifact } from "../policy/policy-validator.js";
import { targetPathFrom } from "../core/paths.js";

export type PolicyWorkflowSummary = PolicyRenderSummary & {
  readonly mode: "init" | "show" | "validate" | "set-strictness" | "migrate";
  /**
   * Rule keys the stored file omitted. On `show`/`validate` these are being
   * back-filled at load; on `migrate` these are the keys just written.
   */
  readonly filledRuleKeys?: readonly string[];
};

export type PolicyInitOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly strictness?: StrictnessMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type PolicyShowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly now?: string;
};

export type PolicyValidateOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly now?: string;
};

export type PolicySetStrictnessOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly strictness: StrictnessMode;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type PolicyMigrateOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly dryRun?: boolean;
  readonly now?: string;
};

function validSummary(input: {
  readonly mode: PolicyWorkflowSummary["mode"];
  readonly targetPath: string;
  readonly policy: PolicyArtifact;
  readonly source: "file" | "default";
  readonly dryRun: boolean;
  readonly created: boolean;
  readonly updated: boolean;
  readonly warnings?: readonly string[];
  readonly filledRuleKeys?: readonly string[];
  readonly nextCommand: string;
}): PolicyWorkflowSummary {
  const policyPath = policyArtifactPath(input.targetPath);

  return {
    success: true,
    filledRuleKeys: input.filledRuleKeys ?? [],
    mode: input.mode,
    command: input.mode,
    targetPath: input.targetPath,
    policyPath: relativePath(input.targetPath, policyPath),
    source: input.source,
    policy: input.policy,
    dryRun: input.dryRun,
    created: input.created,
    updated: input.updated,
    validation: {
      passed: true,
      errors: []
    },
    warnings: input.warnings ?? [],
    nextCommand: input.nextCommand
  };
}

function invalidSummary(input: {
  readonly mode: PolicyWorkflowSummary["mode"];
  readonly targetPath: string;
  readonly policy: PolicyArtifact;
  readonly errors: readonly string[];
  readonly warnings?: readonly string[];
}): PolicyWorkflowSummary {
  const policyPath = policyArtifactPath(input.targetPath);

  return {
    success: false,
    mode: input.mode,
    command: input.mode,
    targetPath: input.targetPath,
    policyPath: relativePath(input.targetPath, policyPath),
    source: "file",
    policy: input.policy,
    dryRun: false,
    created: false,
    updated: false,
    validation: {
      passed: false,
      errors: input.errors
    },
    warnings: input.warnings ?? [],
    nextCommand: "Fix .visp/policy.json and run `visp-kit policy validate`."
  };
}

async function writePolicy(
  targetPath: string,
  policy: PolicyArtifact
): Promise<Result<void, VispError>> {
  const write = await writeArtifact(policyArtifactPath(targetPath), policyArtifactSchema, policy, {
    artifactName: "policy"
  });

  return write.ok ? ok(undefined) : write;
}

async function requirePolicyFile(targetPath: string): Promise<Result<void, VispError>> {
  const exists = await pathExists(policyArtifactPath(targetPath));

  if (!exists.ok) return exists;

  if (!exists.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Policy file is missing. Run `visp-kit policy init` first."
      )
    );
  }

  return ok(undefined);
}

export async function runPolicyInitWorkflow(
  options: PolicyInitOptions = {}
): Promise<Result<PolicyWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const now = options.now ?? new Date().toISOString();
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) return initialized;

  const policyPath = policyArtifactPath(targetPath);
  const exists = await pathExists(policyPath);

  if (!exists.ok) return exists;

  if (exists.value && !force) {
    return err(
      new VispError("VALIDATION_FAILED", "Policy file already exists. Use --force to overwrite it.")
    );
  }

  const defaultStrictness =
    options.strictness === undefined
      ? await defaultPolicyStrictness(targetPath)
      : ok(options.strictness);

  if (!defaultStrictness.ok) return defaultStrictness;

  const policy = createDefaultPolicy({
    strictnessMode: defaultStrictness.value,
    now
  });

  if (!dryRun) {
    const write = await writePolicy(targetPath, policy);
    if (!write.ok) return write;
  }

  return ok(
    validSummary({
      mode: "init",
      targetPath,
      policy,
      source: dryRun ? "default" : "file",
      dryRun,
      created: !exists.value,
      updated: exists.value && force,
      nextCommand: "visp-kit policy validate"
    })
  );
}

export async function runPolicyShowWorkflow(
  options: PolicyShowOptions = {}
): Promise<Result<PolicyWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const loaded = await loadEffectivePolicy({ targetPath, now });

  if (!loaded.ok) return loaded;

  return ok(
    validSummary({
      mode: "show",
      targetPath,
      policy: loaded.value.policy,
      source: loaded.value.source,
      dryRun: false,
      created: false,
      updated: false,
      warnings: loaded.value.warnings,
      filledRuleKeys: loaded.value.filledRuleKeys,
      nextCommand: !loaded.value.exists
        ? "visp-kit policy init"
        : loaded.value.filledRuleKeys.length > 0
          ? "visp-kit policy migrate"
          : "visp-kit policy validate"
    })
  );
}

export async function runPolicyValidateWorkflow(
  options: PolicyValidateOptions = {}
): Promise<Result<PolicyWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const now = options.now ?? new Date().toISOString();
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) return initialized;

  const required = await requirePolicyFile(targetPath);

  if (!required.ok) return required;

  const raw = await readPolicyFile(targetPath);

  if (!raw.ok) {
    const fallbackStrictness = await defaultPolicyStrictness(targetPath);
    const fallbackPolicy = createDefaultPolicy({
      strictnessMode: fallbackStrictness.ok ? fallbackStrictness.value : "standard",
      now
    });
    return ok(
      invalidSummary({
        mode: "validate",
        targetPath,
        policy: fallbackPolicy,
        errors: [raw.error.message]
      })
    );
  }

  const validation = validatePolicyArtifact(raw.value.policy);

  return ok(
    validation.passed
      ? validSummary({
          mode: "validate",
          targetPath,
          policy: raw.value.policy,
          source: "file",
          dryRun: false,
          created: false,
          updated: false,
          warnings: raw.value.warnings,
          filledRuleKeys: raw.value.filledRuleKeys,
          nextCommand:
            raw.value.filledRuleKeys.length > 0 ? "visp-kit policy migrate" : "visp-kit policy show"
        })
      : invalidSummary({
          mode: "validate",
          targetPath,
          policy: raw.value.policy,
          errors: validation.errors
        })
  );
}

export async function runPolicySetStrictnessWorkflow(
  options: PolicySetStrictnessOptions
): Promise<Result<PolicyWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) return initialized;

  const required = await requirePolicyFile(targetPath);

  if (!required.ok) return required;

  const loaded = await readPolicyFile(targetPath);

  if (!loaded.ok) return loaded;

  const policy: PolicyArtifact = {
    ...loaded.value.policy,
    strictnessMode: options.strictness,
    rules: policyRulesForStrictness(options.strictness),
    updatedAt: now
  };

  if (!dryRun) {
    const write = await writePolicy(targetPath, policy);
    if (!write.ok) return write;
  }

  return ok(
    validSummary({
      mode: "set-strictness",
      targetPath,
      policy,
      source: "file",
      dryRun,
      created: false,
      updated: true,
      nextCommand: "visp-kit policy validate"
    })
  );
}

/**
 * Write the strictness-preset value for every rule key the stored policy omits.
 *
 * Rules added after a file was written validate as absent, and absent used to
 * mean off at every gate. The loader now resolves absence to the preset value,
 * so this command does not change what is enforced — it makes the file say what
 * is already true, which is the point of policy-as-code. Keys stored as `false`
 * are decisions and are left alone; only absence is filled.
 */
export async function runPolicyMigrateWorkflow(
  options: PolicyMigrateOptions = {}
): Promise<Result<PolicyWorkflowSummary, VispError>> {
  const targetPath = targetPathFrom(options);
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const initialized = await ensureVispProject(targetPath);

  if (!initialized.ok) return initialized;

  const required = await requirePolicyFile(targetPath);

  if (!required.ok) return required;

  const stored = await readStoredPolicyFile(targetPath);

  if (!stored.ok) return stored;

  const resolved = resolvePolicyRules(stored.value.rules, stored.value.strictnessMode);

  if (resolved.filledKeys.length === 0) {
    return ok(
      validSummary({
        mode: "migrate",
        targetPath,
        policy: stored.value,
        source: "file",
        dryRun,
        created: false,
        updated: false,
        filledRuleKeys: [],
        nextCommand: "visp-kit policy validate"
      })
    );
  }

  const policy: PolicyArtifact = {
    ...stored.value,
    rules: resolved.rules,
    updatedAt: now
  };

  if (!dryRun) {
    const write = await writePolicy(targetPath, policy);
    if (!write.ok) return write;
  }

  return ok(
    validSummary({
      mode: "migrate",
      targetPath,
      policy,
      source: "file",
      dryRun,
      created: false,
      updated: !dryRun,
      filledRuleKeys: resolved.filledKeys,
      warnings: [
        `Recorded ${resolved.filledKeys.length} previously absent rule ${
          resolved.filledKeys.length === 1 ? "key" : "keys"
        } at the ${stored.value.strictnessMode} defaults: ${resolved.filledKeys.join(", ")}.`
      ],
      nextCommand: "visp-kit policy validate"
    })
  );
}

export { formatPolicySummary };
