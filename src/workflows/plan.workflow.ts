import path from "node:path";

import {
  planArtifactPath,
  planMarkdownPath,
  promptArtifactPath,
  specArtifactPath,
  specMarkdownPath
} from "../artifacts/artifact-paths.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, type Result } from "../core/result.js";
import { renderPlanPrompt } from "../prompts/render-plan-prompt.js";
import { createPlanDraftArtifact, renderPlanMarkdown } from "../templates/phase7-templates.js";
import { validatePlan } from "../validators/validate-plan.js";
import { validateSpec } from "../validators/validate-spec.js";
import { resolveActiveFeature } from "./shared/active-feature.js";
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

async function validateExisting(input: {
  readonly targetPath: string;
  readonly featureKey: string;
}): Promise<WorkflowValidation> {
  const markdownPath = planMarkdownPath(input.targetPath, input.featureKey);
  const artifactPath = planArtifactPath(input.targetPath, input.featureKey);
  const textErrors = await validateTextExists(
    markdownPath,
    relativePath(input.targetPath, markdownPath)
  );
  const artifact = await validateArtifactFile(
    artifactPath,
    relativePath(input.targetPath, artifactPath),
    planDraftArtifactSchema,
    "plan"
  );
  const semantic =
    artifact.value === undefined ? { passed: false, errors: [] } : validatePlan(artifact.value);
  const errors = [...textErrors, ...artifact.errors, ...semantic.errors];

  return { passed: errors.length === 0, errors };
}

export async function runPlanWorkflow(
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

  const promptPath = promptArtifactPath(targetPath, "plan");
  const promptDisplayPath = relativePath(targetPath, promptPath);

  if (validateOnly) {
    return completeTemplateWorkflow({
      command: "plan",
      targetPath,
      feature: feature.value,
      files: [],
      promptFile: textGeneratedFile({
        targetPath,
        path: promptPath,
        contents: renderPlanPrompt(feature.value)
      }),
      force,
      dryRun,
      promptOnly,
      validateOnly,
      validation: await validateExisting({ targetPath, featureKey: feature.value.key }),
      promptPath: promptDisplayPath,
      warnings: [],
      nextCommand: "visp tasks",
      now
    });
  }

  const missingSpec = promptOnly
    ? []
    : await missingFileErrors([
        {
          path: specMarkdownPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/spec.md`
        },
        {
          path: specArtifactPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/spec.json`
        }
      ]);

  if (missingSpec.length > 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Specification artifacts are missing. Run `visp spec` first.",
        { recovery: "visp spec" }
      )
    );
  }

  if (!promptOnly) {
    const spec = await readArtifact(
      specArtifactPath(targetPath, feature.value.key),
      specArtifactSchema,
      { artifactName: "spec" }
    );
    if (!spec.ok) return spec;
    const readiness = validateSpec({ spec: spec.value });
    if (!readiness.passed) {
      return err(new VispError(
        "VALIDATION_FAILED",
        `Specification is incomplete: ${readiness.errors.join(" ")}`,
        { recovery: "visp spec --validate" }
      ));
    }
  }

  const artifact = createPlanDraftArtifact({ feature: feature.value, now });
  const validation = validatePlan(artifact);

  return completeTemplateWorkflow({
    command: "plan",
    targetPath,
    feature: feature.value,
    files: [
      textGeneratedFile({
        targetPath,
        path: planMarkdownPath(targetPath, feature.value.key),
        contents: renderPlanMarkdown(feature.value)
      }),
      artifactGeneratedFile({
        targetPath,
        path: planArtifactPath(targetPath, feature.value.key),
        artifactName: "plan",
        schema: planDraftArtifactSchema,
        value: artifact
      })
    ],
    promptFile: textGeneratedFile({
      targetPath,
      path: promptPath,
      contents: renderPlanPrompt(feature.value)
    }),
    force,
    dryRun,
    promptOnly,
    validateOnly,
    validation,
    promptPath: promptDisplayPath,
    warnings: [],
    nextCommand: "visp tasks",
    now
  });
}
