import path from "node:path";

import {
  compactConstitutionArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectSummaryArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { type BudgetMode, type Preset } from "../artifacts/schemas/common.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  type ProjectConfig,
  type ProjectProfile
} from "../artifacts/schemas/project.schema.js";
import { VispError } from "../core/errors.js";
import { ensureDir, pathExists, readTextFile } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  createConstitutionSummary,
  type ConstitutionFileAction,
  type ConstitutionSummary
} from "../constitution/constitution-summary.js";
import { buildConstitutionRules } from "../constitution/constitution-rules.js";
import {
  renderCompactConstitution,
  renderFullConstitution
} from "../constitution/render-constitution.js";
import {
  validateCompactConstitution,
  type CompactValidationResult
} from "../constitution/validate-compact-constitution.js";
import {
  plannedConstitutionFiles,
  writePlannedConstitutionFile
} from "./constitution/write-plan.js";

export type ConstitutionWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly preset?: Preset;
  readonly budget?: BudgetMode;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly validate?: boolean;
  readonly now?: string;
};

async function optionalProject(targetPath: string): Promise<ProjectProfile | undefined> {
  const result = await readArtifact(projectProfileArtifactPath(targetPath), projectProfileSchema, {
    artifactName: "project profile"
  });

  return result.ok ? result.value : undefined;
}

async function optionalText(filePath: string): Promise<string | undefined> {
  const result = await readTextFile(filePath);
  return result.ok ? result.value : undefined;
}

async function configOrDefault(input: {
  readonly targetPath: string;
  readonly preset?: Preset;
  readonly budget?: BudgetMode;
}): Promise<Result<{ preset: Preset; budget: BudgetMode }, VispError>> {
  if (input.preset !== undefined && input.budget !== undefined) {
    return ok({ preset: input.preset, budget: input.budget });
  }

  const config = await readArtifact(
    projectConfigArtifactPath(input.targetPath),
    projectConfigSchema,
    { artifactName: "project config" }
  );

  if (!config.ok && config.error.code !== "FILE_NOT_FOUND") {
    return config;
  }

  const value: ProjectConfig | undefined = config.ok ? config.value : undefined;

  return ok({
    preset: input.preset ?? value?.preset ?? "generic",
    budget: input.budget ?? value?.budgetMode ?? "lean"
  });
}

async function validateExistingCompact(
  targetPath: string
): Promise<Result<CompactValidationResult, VispError>> {
  const compact = await readTextFile(compactConstitutionArtifactPath(targetPath));

  if (!compact.ok) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Compact constitution not found. Run `visp-kit constitution` first."
      )
    );
  }

  return ok(validateCompactConstitution(compact.value));
}

export async function runConstitutionWorkflow(
  options: ConstitutionWorkflowOptions = {}
): Promise<Result<ConstitutionSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const validate = options.validate ?? false;
  const now = options.now ?? new Date().toISOString();
  const hasVisp = await pathExists(vispDir(targetPath));

  if (!hasVisp.ok) return hasVisp;
  if (!hasVisp.value) {
    return err(
      new VispError("VALIDATION_FAILED", "Visp Kit is not initialized. Run `visp-kit init` first.")
    );
  }

  const resolved = await configOrDefault({
    targetPath,
    preset: options.preset,
    budget: options.budget
  });

  if (!resolved.ok) return resolved;

  if (validate && !force) {
    const validation = await validateExistingCompact(targetPath);

    if (!validation.ok) return validation;

    return ok(
      createConstitutionSummary({
        targetPath,
        preset: resolved.value.preset,
        budget: resolved.value.budget,
        actions: [],
        dryRun,
        validation: validation.value,
        warnings: []
      })
    );
  }

  const rules = buildConstitutionRules(resolved.value.preset, resolved.value.budget);
  const compact = renderCompactConstitution(rules);
  const full = renderFullConstitution({
    generatedAt: now,
    preset: resolved.value.preset,
    budget: resolved.value.budget,
    rules,
    project: await optionalProject(targetPath),
    projectSummary: await optionalText(projectSummaryArtifactPath(targetPath))
  });
  const files = plannedConstitutionFiles({ targetPath, full, compact });
  const actions: ConstitutionFileAction[] = [];

  if (!dryRun) {
    const directory = await ensureDir(path.join(targetPath, ".visp", "memory"));

    if (!directory.ok) return directory;
  }

  for (const file of files) {
    const result = await writePlannedConstitutionFile(file, { force, dryRun });

    if (!result.ok) return result;

    actions.push(result.value);
  }

  const compactAction = actions.find((entry) => entry.path.endsWith("constitution.compact.md"));
  const validation =
    compactAction?.action === "skipped" && !dryRun
      ? await validateExistingCompact(targetPath)
      : ok(validateCompactConstitution(compact));

  if (!validation.ok) return validation;

  return ok(
    createConstitutionSummary({
      targetPath,
      preset: resolved.value.preset,
      budget: resolved.value.budget,
      actions,
      dryRun,
      validation: validation.value,
      warnings: []
    })
  );
}
