import path from "node:path";

import {
  planArtifactPath,
  planMarkdownPath,
  promptArtifactPath,
  specArtifactPath,
  specMarkdownPath,
  taskGraphArtifactPath,
  tasksMarkdownPath,
  traceabilityArtifactPath,
  traceabilityMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import {
  taskGraphArtifactSchema,
  type TaskGraphArtifact
} from "../artifacts/schemas/task.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import {
  traceabilityMatrixSchema,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { renderTasksPrompt } from "../prompts/render-tasks-prompt.js";
import {
  createTaskGraphArtifact,
  createTraceabilitySeed,
  renderTasksMarkdownFromArtifact,
  renderTraceabilityMarkdownFromArtifact,
  traceabilityWithTasks
} from "../templates/phase7-templates.js";
import { validateTaskGraph } from "../validators/validate-task-graph.js";
import { validatePlan } from "../validators/validate-plan.js";
import { resolveActiveFeature, type ActiveFeature } from "./shared/active-feature.js";
import { refreshBudgetReport } from "./shared/budget-refresh.js";
import {
  artifactGeneratedFile,
  completeTemplateWorkflow,
  missingFileErrors,
  textGeneratedFile,
  type TemplateWorkflowOptions,
  validateArtifactFile,
  validateTextExists
} from "./shared/template-workflow.js";
import {
  type TemplateWorkflowSummary,
  type WorkflowValidation
} from "./shared/workflow-summary.js";
import {
  readSpecArtifactWithNormalization,
  validateSpecArtifactWithNormalization
} from "./shared/spec-artifact.js";

async function readTraceabilityOrSeed(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly feature: ActiveFeature;
  readonly spec: SpecArtifact;
  readonly now: string;
}): Promise<Result<TraceabilityMatrix, VispError>> {
  const traceabilityPath = traceabilityArtifactPath(input.targetPath, input.featureKey);
  const exists = await pathExists(traceabilityPath);

  if (!exists.ok) return exists;

  if (exists.value) {
    return readArtifact(traceabilityPath, traceabilityMatrixSchema, {
      artifactName: "traceability"
    });
  }

  return {
    ok: true,
    value: createTraceabilitySeed({
      feature: input.feature,
      spec: input.spec,
      now: input.now
    })
  };
}

async function validateExisting(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly dryRun: boolean;
}): Promise<{
  readonly validation: WorkflowValidation;
  readonly warnings: readonly string[];
  readonly taskGraph?: TaskGraphArtifact;
  readonly traceability?: TraceabilityMatrix;
}> {
  const tasksMd = tasksMarkdownPath(input.targetPath, input.featureKey);
  const taskGraphJson = taskGraphArtifactPath(input.targetPath, input.featureKey);
  const specJson = specArtifactPath(input.targetPath, input.featureKey);
  const traceJson = traceabilityArtifactPath(input.targetPath, input.featureKey);
  const textErrors = await validateTextExists(tasksMd, relativePath(input.targetPath, tasksMd));
  const taskGraph = await validateArtifactFile(
    taskGraphJson,
    relativePath(input.targetPath, taskGraphJson),
    taskGraphArtifactSchema,
    "task graph"
  );
  const spec = await validateSpecArtifactWithNormalization({
    artifactPath: specJson,
    displayPath: relativePath(input.targetPath, specJson),
    dryRun: input.dryRun,
    writeNormalized: true
  });
  const traceability = await validateArtifactFile(
    traceJson,
    relativePath(input.targetPath, traceJson),
    traceabilityMatrixSchema,
    "traceability"
  );
  const semantic =
    taskGraph.value === undefined || spec.value === undefined
      ? { passed: false, errors: [] }
      : validateTaskGraph({
          taskGraph: taskGraph.value,
          spec: spec.value,
          traceability: traceability.value
        });
  const errors = [
    ...textErrors,
    ...taskGraph.errors,
    ...spec.errors,
    ...traceability.errors,
    ...semantic.errors
  ];

  return {
    validation: { passed: errors.length === 0, errors },
    warnings: spec.warnings,
    taskGraph: taskGraph.value,
    traceability: traceability.value
  };
}

export async function runTasksWorkflow(
  options: TemplateWorkflowOptions = {}
): Promise<Result<TemplateWorkflowSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const force = options.force ?? false;
  const dryRun = options.dryRun ?? false;
  const validateOnly = options.validate ?? false;
  const promptOnly = options.promptOnly ?? false;
  const now = options.now ?? new Date().toISOString();
  const feature = await resolveActiveFeature({
    targetPath,
    feature: options.feature
  });

  if (!feature.ok) return feature;

  const promptPath = promptArtifactPath(targetPath, "tasks");
  const promptDisplayPath = relativePath(targetPath, promptPath);

  if (validateOnly) {
    const validation = await validateExisting({
      targetPath,
      featureKey: feature.value.key,
      dryRun
    });

    const derivedFiles = [
      ...(validation.taskGraph === undefined
        ? []
        : [
            textGeneratedFile({
              targetPath,
              path: tasksMarkdownPath(targetPath, feature.value.key),
              contents: renderTasksMarkdownFromArtifact({
                feature: feature.value,
                artifact: validation.taskGraph
              })
            })
          ]),
      ...(validation.traceability === undefined
        ? []
        : [
            textGeneratedFile({
              targetPath,
              path: traceabilityMarkdownPath(targetPath, feature.value.key),
              contents: renderTraceabilityMarkdownFromArtifact({
                feature: feature.value,
                traceability: validation.traceability
              })
            })
          ])
    ];

    const summary = await completeTemplateWorkflow({
      command: "tasks",
      targetPath,
      feature: feature.value,
      files: [],
      derivedFiles,
      promptFile: textGeneratedFile({
        targetPath,
        path: promptPath,
        contents: renderTasksPrompt(feature.value)
      }),
      force,
      dryRun,
      promptOnly,
      validateOnly,
      validation: validation.validation,
      promptPath: promptDisplayPath,
      warnings: validation.warnings,
      nextCommand: "visp context T001",
      now
    });

    if (!summary.ok || promptOnly || !summary.value.validation.passed) {
      return summary;
    }

    const budgetRefresh = await refreshBudgetReport({
      targetPath,
      feature: feature.value.key,
      dryRun,
      now
    });

    return ok({
      ...summary.value,
      updatedFiles: [...summary.value.updatedFiles, ...budgetRefresh.writtenFiles],
      warnings: [...new Set([...summary.value.warnings, ...budgetRefresh.warnings])]
    });
  }

  const missing = promptOnly
    ? []
    : await missingFileErrors([
        {
          path: specMarkdownPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/spec.md`
        },
        {
          path: specArtifactPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/spec.json`
        },
        {
          path: planMarkdownPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/plan.md`
        },
        {
          path: planArtifactPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/plan.json`
        }
      ]);

  if (missing.length > 0) {
    return err(
      new VispError("VALIDATION_FAILED", "Plan artifacts are missing. Run `visp plan` first.", {
        recovery: "visp plan"
      })
    );
  }

  if (!promptOnly) {
    const plan = await readArtifact(
      planArtifactPath(targetPath, feature.value.key),
      planDraftArtifactSchema,
      { artifactName: "plan" }
    );
    if (!plan.ok) return plan;
    const readiness = validatePlan(plan.value);
    if (!readiness.passed) {
      return err(
        new VispError("VALIDATION_FAILED", `Plan is incomplete: ${readiness.errors.join(" ")}`, {
          recovery: "visp plan --validate"
        })
      );
    }
  }

  const spec = await readSpecArtifactWithNormalization({
    artifactPath: specArtifactPath(targetPath, feature.value.key),
    displayPath: relativePath(targetPath, specArtifactPath(targetPath, feature.value.key)),
    dryRun,
    writeNormalized: !promptOnly
  });

  if (!spec.ok) return spec;

  const taskGraph = createTaskGraphArtifact({ feature: feature.value, now });
  const baseTraceability = await readTraceabilityOrSeed({
    targetPath,
    featureKey: feature.value.key,
    feature: feature.value,
    spec: spec.value.value,
    now
  });

  if (!baseTraceability.ok) return baseTraceability;

  const traceability = traceabilityWithTasks({
    traceability: baseTraceability.value,
    taskGraph,
    now
  });
  const validation = validateTaskGraph({
    taskGraph,
    spec: spec.value.value,
    traceability
  });

  const summary = await completeTemplateWorkflow({
    command: "tasks",
    targetPath,
    feature: feature.value,
    files: [
      textGeneratedFile({
        targetPath,
        path: tasksMarkdownPath(targetPath, feature.value.key),
        contents: renderTasksMarkdownFromArtifact({
          feature: feature.value,
          artifact: taskGraph
        })
      }),
      artifactGeneratedFile({
        targetPath,
        path: taskGraphArtifactPath(targetPath, feature.value.key),
        artifactName: "task graph",
        schema: taskGraphArtifactSchema,
        value: taskGraph
      })
    ],
    updateFiles: [
      textGeneratedFile({
        targetPath,
        path: traceabilityMarkdownPath(targetPath, feature.value.key),
        contents: renderTraceabilityMarkdownFromArtifact({
          feature: feature.value,
          traceability
        })
      }),
      artifactGeneratedFile({
        targetPath,
        path: traceabilityArtifactPath(targetPath, feature.value.key),
        artifactName: "traceability",
        schema: traceabilityMatrixSchema,
        value: traceability
      })
    ],
    promptFile: textGeneratedFile({
      targetPath,
      path: promptPath,
      contents: renderTasksPrompt(feature.value)
    }),
    force,
    dryRun,
    promptOnly,
    validateOnly,
    validation,
    promptPath: promptDisplayPath,
    warnings: spec.value.warnings,
    nextCommand: "visp context T001",
    now
  });

  if (!summary.ok || promptOnly || !summary.value.validation.passed) {
    return summary;
  }

  const budgetRefresh = await refreshBudgetReport({
    targetPath,
    feature: feature.value.key,
    dryRun,
    now
  });

  return ok({
    ...summary.value,
    updatedFiles: [...summary.value.updatedFiles, ...budgetRefresh.writtenFiles],
    warnings: [...new Set([...summary.value.warnings, ...budgetRefresh.warnings])]
  });
}
