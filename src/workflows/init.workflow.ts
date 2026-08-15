import path from "node:path";

import {
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../artifacts/schemas/common.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type VispError } from "../core/errors.js";
import { ensureDir } from "../core/file-system.js";
import { ok, type Result } from "../core/result.js";
import { buildInitFilePlan } from "./init/file-plan.js";
import { createInitSummary, type InitFileAction, type InitSummary } from "./init/init-summary.js";
import { detectPreset } from "../presets/preset-detection.js";
import { writePlannedFile } from "./init/planned-file.js";
import { applyVispIgnore, planVispIgnore } from "./init/visp-ignore.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";

export type InitWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly agent?: AgentMode;
  readonly budget?: BudgetMode;
  readonly preset?: Preset;
  readonly strictness?: StrictnessMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

async function ensureDirectories(
  directories: readonly string[],
  dryRun: boolean
): Promise<Result<void, VispError>> {
  if (dryRun) {
    return ok(undefined);
  }

  for (const directory of directories) {
    const result = await ensureDir(directory);

    if (!result.ok) {
      return result;
    }
  }

  return ok(undefined);
}

export async function runInitWorkflow(
  options: InitWorkflowOptions = {}
): Promise<Result<InitSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const agent = options.agent ?? "generic";
  const budget = options.budget ?? "lean";
  const strictness = options.strictness ?? "standard";
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const detectedPreset =
    options.preset === undefined
      ? await detectPreset(targetPath)
      : ok({ preset: options.preset, reason: "Preset provided by --preset." });

  if (!detectedPreset.ok) return detectedPreset;

  const preset = detectedPreset.value.preset;
  const plan = await buildInitFilePlan({
    targetPath,
    agent,
    preset,
    budget,
    strictness,
    force,
    dryRun,
    now
  });

  if (!plan.ok) {
    return plan;
  }

  const directoryResult = await ensureDirectories(plan.value.directories, dryRun);

  if (!directoryResult.ok) {
    return directoryResult;
  }

  const actions: InitFileAction[] = [...plan.value.actions];

  for (const file of plan.value.files) {
    const result = await writePlannedFile(file, { force, dryRun });

    if (!result.ok) {
      return result;
    }

    actions.push(result.value);
  }

  const ignore = await applyVispIgnore({
    targetPath,
    plan: await planVispIgnore(targetPath),
    dryRun
  });

  actions.push(...ignore.actions);

  const warnings = [...plan.value.warnings, ...ignore.warnings];

  const run = await recordWorkflowRun({
    targetPath,
    command: "init",
    endedAt: now,
    success: true,
    result: warnings.length > 0 ? "warnings" : "passed",
    actions,
    warnings,
    dryRun
  });

  actions.push(
    ...run.writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    }))
  );

  return ok(
    createInitSummary({
      targetPath,
      agent,
      preset,
      budget,
      actions,
      dryRun,
      warnings: [...warnings, ...run.warnings]
    })
  );
}
