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
import {
  specArtifactSchema,
  type SpecArtifact
} from "../artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../artifacts/schemas/task.schema.js";
import {
  traceabilityMatrixSchema,
  type TraceabilityMatrix
} from "../artifacts/schemas/traceability.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, type Result } from "../core/result.js";
import { renderTasksPrompt } from "../prompts/render-tasks-prompt.js";
import {
  createTaskGraphArtifact,
  createTraceabilitySeed,
  renderTasksMarkdown,
  renderTraceabilityMarkdown,
  traceabilityWithTasks
} from "../templates/phase7-templates.js";
import { validateTaskGraph } from "../validators/validate-task-graph.js";
import {
  resolveActiveFeature,
  type ActiveFeature
} from "./shared/active-feature.js";
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
}> {
  const tasksMd = tasksMarkdownPath(input.targetPath, input.featureKey);
  const taskGraphJson = taskGraphArtifactPath(input.targetPath, input.featureKey);
  const specJson = specArtifactPath(input.targetPath, input.featureKey);
  const traceJson = traceabilityArtifactPath(input.targetPath, input.featureKey);
  const textErrors = await validateTextExists(
    tasksMd,
    relativePath(input.targetPath, tasksMd)
  );
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
    warnings: spec.warnings
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

    return completeTemplateWorkflow({
      command: "tasks",
      targetPath,
      feature: feature.value,
      files: [],
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
      new VispError(
        "VALIDATION_FAILED",
        "Plan artifacts are missing. Run `visp plan` first."
      )
    );
  }

  const spec = await readSpecArtifactWithNormalization({
    artifactPath: specArtifactPath(targetPath, feature.value.key),
    displayPath: relativePath(
      targetPath,
      specArtifactPath(targetPath, feature.value.key)
    ),
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

  return completeTemplateWorkflow({
    command: "tasks",
    targetPath,
    feature: feature.value,
    files: [
      textGeneratedFile({
        targetPath,
        path: tasksMarkdownPath(targetPath, feature.value.key),
        contents: renderTasksMarkdown(feature.value)
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
        contents: renderTraceabilityMarkdown({
          title: feature.value.intent.title,
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
}
