import { readdir } from "node:fs/promises";
import path from "node:path";

import {
  featureArtifactDir,
  featureIntentArtifactPath,
  featureIntentMarkdownPath,
  featuresArtifactDir,
  compactConstitutionArtifactPath,
  projectConfigArtifactPath,
  projectStatusArtifactPath,
  projectSummaryArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  type BudgetMode,
  type RiskLevel
} from "../artifacts/schemas/common.schema.js";
import {
  featureIntentSchema,
  type FeatureIntent
} from "../artifacts/schemas/feature.schema.js";
import {
  projectConfigSchema,
  projectStatusSchema,
  type ProjectConfig,
  type ProjectStatus
} from "../artifacts/schemas/project.schema.js";
import { type CommandRunner } from "../core/command-runner.js";
import { VispError, toVispError } from "../core/errors.js";
import {
  ensureDir,
  pathExists,
  readTextFile,
  writeTextFile
} from "../core/file-system.js";
import { relativePath, vispDir } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import {
  featureDirectoryForSlug,
  featureDirectoryName,
  nextFeatureIdFromNames,
  parseFeatureNumber
} from "../features/feature-id.js";
import {
  createFeatureBranch,
  defaultFeatureBranchName,
  type FeatureBranchSummary
} from "../features/git-branch.js";
import {
  knownConstraintsFromCompactConstitution,
  projectContextFromSummary,
  renderIntentMarkdown
} from "../features/render-intent.js";
import {
  createFeatureSummary,
  type FeatureFileAction,
  type FeatureSummary
} from "../features/feature-summary.js";
import { slugifyFeatureTitle } from "../features/slugify.js";
import { updateStatusForFeatureIntent } from "../features/status-update.js";
import { recordWorkflowRun } from "./shared/run-recorder.js";
import { refreshFeatureTimeline } from "./shared/timeline-refresh.js";

export type FeatureWorkflowOptions = {
  readonly featureIdea?: string;
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly budget?: BudgetMode;
  readonly risk?: RiskLevel;
  readonly branch?: boolean;
  readonly noBranch?: boolean;
  readonly branchName?: string;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
  readonly commandRunner?: CommandRunner;
};

type PlannedFeature = {
  readonly id: string;
  readonly slug: string;
  readonly key: string;
  readonly title: string;
  readonly rawUserRequest: string;
  readonly featurePath: string;
  readonly featureRelativePath: string;
};

function titleFromIdea(featureIdea: string | undefined): Result<{
  readonly title: string;
  readonly rawUserRequest: string;
}, VispError> {
  const rawUserRequest = featureIdea ?? "";
  const title = rawUserRequest.trim().replace(/\s+/g, " ");

  if (title.length === 0) {
    return err(
      new VispError("VALIDATION_FAILED", "Feature title is required.")
    );
  }

  return ok({ title, rawUserRequest });
}

async function ensureInitialized(targetPath: string): Promise<Result<void, VispError>> {
  const hasVisp = await pathExists(vispDir(targetPath));

  if (!hasVisp.ok) return hasVisp;
  if (!hasVisp.value) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Visp Kit is not initialized. Run `visp init` first."
      )
    );
  }

  return ok(undefined);
}

async function configBudget(
  targetPath: string,
  budget: BudgetMode | undefined
): Promise<Result<BudgetMode, VispError>> {
  if (budget !== undefined) {
    return ok(budget);
  }

  const config = await readArtifact(
    projectConfigArtifactPath(targetPath),
    projectConfigSchema,
    { artifactName: "project config" }
  );

  if (!config.ok && config.error.code !== "FILE_NOT_FOUND") {
    return config;
  }

  const value: ProjectConfig | undefined = config.ok ? config.value : undefined;
  return ok(value?.budgetMode ?? "lean");
}

async function existingFeatureNames(
  targetPath: string
): Promise<Result<readonly string[], VispError>> {
  const directory = featuresArtifactDir(targetPath);
  const exists = await pathExists(directory);

  if (!exists.ok) return exists;
  if (!exists.value) return ok([]);

  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return ok(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort()
    );
  } catch (error) {
    return err(toVispError(error, "FILE_SYSTEM_ERROR"));
  }
}

async function readOptionalText(filePath: string): Promise<string | undefined> {
  const result = await readTextFile(filePath);
  return result.ok ? result.value : undefined;
}

async function readExistingStatus(
  targetPath: string
): Promise<Result<ProjectStatus | undefined, VispError>> {
  const status = await readArtifact(
    projectStatusArtifactPath(targetPath),
    projectStatusSchema,
    { artifactName: "project status" }
  );

  if (!status.ok && status.error.code !== "FILE_NOT_FOUND") {
    return status;
  }

  return ok(status.ok ? status.value : undefined);
}

function createIntent(input: {
  readonly planned: PlannedFeature;
  readonly budget: BudgetMode;
  readonly risk: RiskLevel;
  readonly now: string;
}): FeatureIntent {
  return {
    id: input.planned.id,
    slug: input.planned.slug,
    title: input.planned.title,
    rawUserRequest: input.planned.rawUserRequest,
    status: "draft",
    budgetMode: input.budget,
    riskLevel: input.risk,
    createdAt: input.now,
    updatedAt: input.now
  };
}

function plannedFeature(input: {
  readonly targetPath: string;
  readonly featureIdea: string | undefined;
  readonly directoryNames: readonly string[];
}): Result<PlannedFeature, VispError> {
  const title = titleFromIdea(input.featureIdea);

  if (!title.ok) return title;

  const slug = slugifyFeatureTitle(title.value.title);

  if (slug.length === 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Feature title must contain at least one supported letter or number."
      )
    );
  }

  try {
    const existingDirectory = featureDirectoryForSlug(
      input.directoryNames,
      slug
    );
    const existingId =
      existingDirectory === undefined
        ? undefined
        : parseFeatureNumber(existingDirectory);
    const id =
      existingId === undefined
        ? nextFeatureIdFromNames(input.directoryNames)
        : String(existingId).padStart(3, "0");
    const key = featureDirectoryName(id, slug);
    const featurePath = featureArtifactDir(input.targetPath, key);

    return ok({
      id,
      slug,
      key,
      title: title.value.title,
      rawUserRequest: title.value.rawUserRequest,
      featurePath,
      featureRelativePath: relativePath(input.targetPath, featurePath)
    });
  } catch (error) {
    return err(toVispError(error, "VALIDATION_FAILED"));
  }
}

async function featureFolderConflict(
  planned: PlannedFeature,
  force: boolean
): Promise<Result<void, VispError>> {
  const exists = await pathExists(planned.featurePath);

  if (!exists.ok) return exists;
  if (exists.value && !force) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Feature folder already exists: ${planned.featureRelativePath}. Use --force to overwrite generated intent files.`
      )
    );
  }

  return ok(undefined);
}

async function writeFeatureFiles(input: {
  readonly targetPath: string;
  readonly planned: PlannedFeature;
  readonly intent: FeatureIntent;
  readonly intentMarkdown: string;
  readonly status: ProjectStatus;
  readonly dryRun: boolean;
}): Promise<Result<readonly FeatureFileAction[], VispError>> {
  const actions: FeatureFileAction[] = [];
  const files = [
    {
      path: featureIntentMarkdownPath(input.targetPath, input.planned.key),
      displayPath: `${input.planned.featureRelativePath}/intent.md`,
      kind: "text" as const,
      contents: input.intentMarkdown
    },
    {
      path: featureIntentArtifactPath(input.targetPath, input.planned.key),
      displayPath: `${input.planned.featureRelativePath}/intent.json`,
      kind: "artifact" as const,
      value: input.intent
    }
  ];

  if (!input.dryRun) {
    const directory = await ensureDir(input.planned.featurePath);

    if (!directory.ok) return directory;
  }

  for (const file of files) {
    const exists = await pathExists(file.path);

    if (!exists.ok) return exists;

    const action = exists.value ? "overwritten" : "created";
    actions.push({ path: file.displayPath, action });

    if (input.dryRun) {
      continue;
    }

    const writeResult =
      file.kind === "text"
        ? await writeTextFile(file.path, file.contents)
        : await writeArtifact(file.path, featureIntentSchema, file.value, {
            artifactName: "feature intent"
          });

    if (!writeResult.ok) return writeResult;
  }

  actions.push({ path: ".visp/status.json", action: "updated" });

  if (!input.dryRun) {
    const statusWrite = await writeArtifact(
      projectStatusArtifactPath(input.targetPath),
      projectStatusSchema,
      input.status,
      { artifactName: "project status" }
    );

    if (!statusWrite.ok) return statusWrite;
  }

  return ok(actions);
}

async function maybeCreateBranch(input: {
  readonly targetPath: string;
  readonly requested: boolean;
  readonly branchName: string | undefined;
  readonly planned: PlannedFeature;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<{
  readonly branch: FeatureBranchSummary;
  readonly warnings: readonly string[];
}, VispError>> {
  if (!input.requested) {
    return ok({
      branch: { requested: false, created: false, name: null },
      warnings: []
    });
  }

  const name =
    input.branchName ?? defaultFeatureBranchName(input.planned.id, input.planned.slug);

  if (input.dryRun) {
    return ok({
      branch: { requested: true, created: false, name },
      warnings: []
    });
  }

  return createFeatureBranch({
    targetPath: input.targetPath,
    branchName: name,
    force: input.force,
    commandRunner: input.commandRunner
  });
}

export async function runFeatureWorkflow(
  options: FeatureWorkflowOptions = {}
): Promise<Result<FeatureSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const risk = options.risk ?? "medium";

  if (options.branch && options.noBranch) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Use either --branch or --no-branch, not both."
      )
    );
  }

  const initialized = await ensureInitialized(targetPath);

  if (!initialized.ok) return initialized;

  const budget = await configBudget(targetPath, options.budget);

  if (!budget.ok) return budget;

  const names = await existingFeatureNames(targetPath);

  if (!names.ok) return names;

  const planned = plannedFeature({
    targetPath,
    featureIdea: options.featureIdea,
    directoryNames: names.value
  });

  if (!planned.ok) return planned;

  const conflict = await featureFolderConflict(planned.value, force);

  if (!conflict.ok) return conflict;

  const existingStatus = await readExistingStatus(targetPath);

  if (!existingStatus.ok) return existingStatus;

  const intent = createIntent({
    planned: planned.value,
    budget: budget.value,
    risk,
    now
  });
  const projectSummary = await readOptionalText(projectSummaryArtifactPath(targetPath));
  const compactConstitution = await readOptionalText(
    compactConstitutionArtifactPath(targetPath)
  );
  const intentMarkdown = renderIntentMarkdown({
    title: planned.value.title,
    rawUserRequest: planned.value.rawUserRequest,
    projectContext: projectContextFromSummary(projectSummary),
    knownConstraints: knownConstraintsFromCompactConstitution(compactConstitution)
  });
  const status = updateStatusForFeatureIntent({
    existing: existingStatus.value,
    featureId: planned.value.id,
    slug: planned.value.slug,
    featurePath: planned.value.featureRelativePath,
    now
  });
  const branchRequested =
    (options.branchName !== undefined && !options.noBranch) ||
    (options.branch === true && !options.noBranch);
  const branch = await maybeCreateBranch({
    targetPath,
    requested: branchRequested,
    branchName: options.branchName,
    planned: planned.value,
    force,
    dryRun,
    commandRunner: options.commandRunner
  });

  if (!branch.ok) return branch;

  const actions = await writeFeatureFiles({
    targetPath,
    planned: planned.value,
    intent,
    intentMarkdown,
    status,
    dryRun
  });

  if (!actions.ok) return actions;

  const timeline = await refreshFeatureTimeline({
    targetPath,
    feature: planned.value.key,
    dryRun,
    now
  });
  const allActions = [
    ...actions.value,
    ...timeline.writtenFiles.map((filePath) => ({
      path: filePath,
      action: "updated" as const
    }))
  ];
  const run = await recordWorkflowRun({
    targetPath,
    command: "feature",
    endedAt: now,
    feature: {
      id: intent.id,
      slug: intent.slug
    },
    success: true,
    result: [...branch.value.warnings, ...timeline.warnings].length > 0 ? "warnings" : "passed",
    actions: allActions,
    warnings: [...branch.value.warnings, ...timeline.warnings],
    dryRun
  });

  return ok(
    createFeatureSummary({
      targetPath,
      feature: {
        id: intent.id,
        slug: intent.slug,
        title: intent.title,
        path: planned.value.featureRelativePath,
        status: intent.status,
        budgetMode: intent.budgetMode,
        riskLevel: intent.riskLevel
      },
      actions: [
        ...allActions,
        ...run.writtenFiles.map((filePath) => ({
          path: filePath,
          action: "updated" as const
        }))
      ],
      branch: branch.value.branch,
      dryRun,
      warnings: [...branch.value.warnings, ...timeline.warnings, ...run.warnings]
    })
  );
}
