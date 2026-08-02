import path from "node:path";

import {
  clarificationsArtifactPath,
  clarificationsMarkdownPath,
  featureIntentArtifactPath,
  featureIntentMarkdownPath,
  promptArtifactPath
} from "../artifacts/artifact-paths.js";
import {
  clarificationArtifactSchema,
  type ClarificationArtifact
} from "../artifacts/schemas/clarification.schema.js";
import { type VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { ok, type Result } from "../core/result.js";
import { renderClarifyPrompt } from "../prompts/render-clarify-prompt.js";
import {
  createClarificationArtifact,
  renderClarificationsMarkdownFromArtifact
} from "../templates/phase7-templates.js";
import { validateClarifications } from "../validators/validate-clarifications.js";
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
}): Promise<{
  readonly validation: WorkflowValidation;
  readonly artifact?: ClarificationArtifact;
}> {
  const markdownPath = clarificationsMarkdownPath(input.targetPath, input.featureKey);
  const artifactPath = clarificationsArtifactPath(input.targetPath, input.featureKey);
  const textErrors = await validateTextExists(
    markdownPath,
    relativePath(input.targetPath, markdownPath)
  );
  const artifact = await validateArtifactFile(
    artifactPath,
    relativePath(input.targetPath, artifactPath),
    clarificationArtifactSchema,
    "clarifications"
  );
  const validation =
    artifact.value === undefined
      ? { passed: false, errors: [...textErrors, ...artifact.errors] }
      : validateClarifications(artifact.value);
  const errors = [...textErrors, ...artifact.errors, ...validation.errors];

  return {
    validation: { passed: errors.length === 0, errors },
    artifact: artifact.value
  };
}

export async function runClarifyWorkflow(
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

  const promptPath = promptArtifactPath(targetPath, "clarify");
  const promptDisplayPath = relativePath(targetPath, promptPath);

  if (validateOnly) {
    const validation = await validateExisting({
      targetPath,
      featureKey: feature.value.key
    });

    return completeTemplateWorkflow({
      command: "clarify",
      targetPath,
      feature: feature.value,
      files: [],
      derivedFiles:
        validation.artifact === undefined
          ? []
          : [
              textGeneratedFile({
                targetPath,
                path: clarificationsMarkdownPath(targetPath, feature.value.key),
                contents: renderClarificationsMarkdownFromArtifact({
                  feature: feature.value,
                  artifact: validation.artifact
                })
              })
            ],
      promptFile: textGeneratedFile({
        targetPath,
        path: promptPath,
        contents: renderClarifyPrompt(feature.value)
      }),
      force,
      dryRun,
      promptOnly,
      validateOnly,
      validation: validation.validation,
      promptPath: promptDisplayPath,
      warnings: [],
      nextCommand: "visp-kit spec",
      now
    });
  }

  const prerequisiteErrors = promptOnly
    ? []
    : await missingFileErrors([
        {
          path: featureIntentMarkdownPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/intent.md`
        },
        {
          path: featureIntentArtifactPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/intent.json`
        }
      ]);

  if (prerequisiteErrors.length > 0) {
    return ok({
      success: false,
      command: "clarify",
      targetPath,
      feature: {
        id: feature.value.id,
        slug: feature.value.slug,
        path: feature.value.relativePath
      },
      createdFiles: [],
      skippedFiles: [],
      staleFiles: [],
      overwrittenFiles: [],
      updatedFiles: [],
      validated: true,
      validation: { passed: false, errors: prerequisiteErrors },
      dryRun,
      promptPath: promptDisplayPath,
      warnings: [],
      nextCommand: "visp-kit spec"
    });
  }

  const artifact = createClarificationArtifact({ feature: feature.value, now });
  const validation = validateClarifications(artifact);

  return completeTemplateWorkflow({
    command: "clarify",
    targetPath,
    feature: feature.value,
    files: [
      textGeneratedFile({
        targetPath,
        path: clarificationsMarkdownPath(targetPath, feature.value.key),
        contents: renderClarificationsMarkdownFromArtifact({
          feature: feature.value,
          artifact
        })
      }),
      artifactGeneratedFile({
        targetPath,
        path: clarificationsArtifactPath(targetPath, feature.value.key),
        artifactName: "clarifications",
        schema: clarificationArtifactSchema,
        value: artifact
      })
    ],
    promptFile: textGeneratedFile({
      targetPath,
      path: promptPath,
      contents: renderClarifyPrompt(feature.value)
    }),
    force,
    dryRun,
    promptOnly,
    validateOnly,
    validation,
    promptPath: promptDisplayPath,
    warnings: [],
    nextCommand: "visp-kit spec",
    now
  });
}
