import path from "node:path";

import {
  clarificationsArtifactPath,
  clarificationsMarkdownPath,
  promptArtifactPath,
  specArtifactPath,
  specMarkdownPath,
  traceabilityArtifactPath,
  traceabilityMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { clarificationArtifactSchema } from "../artifacts/schemas/clarification.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { traceabilityMatrixSchema } from "../artifacts/schemas/traceability.schema.js";
import { VispError } from "../core/errors.js";
import { relativePath } from "../core/paths.js";
import { err, type Result } from "../core/result.js";
import { renderSpecPrompt } from "../prompts/render-spec-prompt.js";
import {
  createSpecArtifact,
  createTraceabilitySeed,
  renderSpecMarkdown,
  renderTraceabilityMarkdown
} from "../templates/phase7-templates.js";
import { validateSpec } from "../validators/validate-spec.js";
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
import { validateSpecArtifactWithNormalization } from "./shared/spec-artifact.js";

async function validateExisting(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly dryRun: boolean;
}): Promise<{
  readonly validation: WorkflowValidation;
  readonly warnings: readonly string[];
}> {
  const specMd = specMarkdownPath(input.targetPath, input.featureKey);
  const specJson = specArtifactPath(input.targetPath, input.featureKey);
  const traceJson = traceabilityArtifactPath(input.targetPath, input.featureKey);
  const traceMd = traceabilityMarkdownPath(input.targetPath, input.featureKey);
  const textErrors = [
    ...(await validateTextExists(specMd, relativePath(input.targetPath, specMd))),
    ...(await validateTextExists(traceMd, relativePath(input.targetPath, traceMd)))
  ];
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
    spec.value === undefined
      ? { passed: false, errors: [] }
      : validateSpec({ spec: spec.value, traceability: traceability.value });
  const errors = [...textErrors, ...spec.errors, ...traceability.errors, ...semantic.errors];

  return {
    validation: { passed: errors.length === 0, errors },
    warnings: spec.warnings
  };
}

export async function runSpecWorkflow(
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

  const promptPath = promptArtifactPath(targetPath, "spec");
  const promptDisplayPath = relativePath(targetPath, promptPath);

  if (validateOnly) {
    const validation = await validateExisting({
      targetPath,
      featureKey: feature.value.key,
      dryRun
    });

    return completeTemplateWorkflow({
      command: "spec",
      targetPath,
      feature: feature.value,
      files: [],
      promptFile: textGeneratedFile({
        targetPath,
        path: promptPath,
        contents: renderSpecPrompt(feature.value)
      }),
      force,
      dryRun,
      promptOnly,
      validateOnly,
      validation: validation.validation,
      promptPath: promptDisplayPath,
      warnings: validation.warnings,
      nextCommand: "visp plan",
      now
    });
  }

  const missingClarifications = promptOnly
    ? []
    : await missingFileErrors([
        {
          path: clarificationsMarkdownPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/clarifications.md`
        },
        {
          path: clarificationsArtifactPath(targetPath, feature.value.key),
          displayPath: `${feature.value.relativePath}/clarifications.json`
        }
      ]);

  if (missingClarifications.length > 0) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Clarification artifacts are missing. Run `visp clarify` first.",
        { recovery: "visp clarify" }
      )
    );
  }

  if (!promptOnly) {
    const clarificationPath = clarificationsArtifactPath(targetPath, feature.value.key);
    const clarifications = await readArtifact(clarificationPath, clarificationArtifactSchema, {
      artifactName: "clarifications"
    });
    if (!clarifications.ok) return clarifications;
    const readiness = validateClarifications(clarifications.value);
    if (!readiness.passed) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Clarifications are incomplete: ${readiness.errors.join(" ")}`,
          { recovery: "visp clarify --validate" }
        )
      );
    }
  }

  const warnings: string[] = [];
  const spec = createSpecArtifact({ feature: feature.value, now });
  const traceability = createTraceabilitySeed({
    feature: feature.value,
    spec,
    now
  });
  const validation = validateSpec({ spec, traceability });

  return completeTemplateWorkflow({
    command: "spec",
    targetPath,
    feature: feature.value,
    files: [
      textGeneratedFile({
        targetPath,
        path: specMarkdownPath(targetPath, feature.value.key),
        contents: renderSpecMarkdown(feature.value)
      }),
      artifactGeneratedFile({
        targetPath,
        path: specArtifactPath(targetPath, feature.value.key),
        artifactName: "spec",
        schema: specArtifactSchema,
        value: spec
      }),
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
      contents: renderSpecPrompt(feature.value)
    }),
    force,
    dryRun,
    promptOnly,
    validateOnly,
    validation,
    promptPath: promptDisplayPath,
    warnings,
    nextCommand: "visp plan",
    now
  });
}
