import path from "node:path";

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
import { createDefaultPolicy, policyRulesForStrictness } from "../policy/policy-defaults.js";
import {
  defaultPolicyStrictness,
  ensureVispProject,
  loadEffectivePolicy,
  readPolicyFile
} from "../policy/policy-loader.js";
import { formatPolicySummary, type PolicyRenderSummary } from "../policy/policy-renderer.js";
import { validatePolicyArtifact } from "../policy/policy-validator.js";

export type PolicyWorkflowSummary = PolicyRenderSummary & {
  readonly mode: "init" | "show" | "validate" | "set-strictness";
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

function targetPathFrom(options: { readonly targetPath?: string; readonly cwd?: string }): string {
  return path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
}

function validSummary(input: {
  readonly mode: PolicyWorkflowSummary["mode"];
  readonly targetPath: string;
  readonly policy: PolicyArtifact;
  readonly source: "file" | "default";
  readonly dryRun: boolean;
  readonly created: boolean;
  readonly updated: boolean;
  readonly warnings?: readonly string[];
  readonly nextCommand: string;
}): PolicyWorkflowSummary {
  const policyPath = policyArtifactPath(input.targetPath);

  return {
    success: true,
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
    nextCommand: "Fix .visp/policy.json and run `visp policy validate`."
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
      new VispError("VALIDATION_FAILED", "Policy file is missing. Run `visp policy init` first.")
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
      nextCommand: "visp policy validate"
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
      nextCommand: loaded.value.exists ? "visp policy validate" : "visp policy init"
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
          nextCommand: "visp policy show"
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
      nextCommand: "visp policy validate"
    })
  );
}

export { formatPolicySummary };
