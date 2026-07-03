import { type ZodType } from "zod";

import {
  contextPackArtifactPath,
  featureIntentArtifactPath,
  planArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { contextPackSchema } from "../artifacts/schemas/context-pack.schema.js";
import { featureIntentSchema } from "../artifacts/schemas/feature.schema.js";
import { planDraftArtifactSchema } from "../artifacts/schemas/plan.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "../artifacts/schemas/project.schema.js";
import { specArtifactSchema } from "../artifacts/schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "../artifacts/schemas/task.schema.js";
import { traceabilityMatrixSchema } from "../artifacts/schemas/traceability.schema.js";
import {
  verificationReportSchema,
  type ArtifactValidationSection,
  type ArtifactValidationResult
} from "../artifacts/schemas/verification.schema.js";
import { pathExists } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";

type ArtifactCheck = {
  readonly path: string;
  readonly displayPath: string;
  readonly schema: ZodType<unknown>;
  readonly name: string;
  readonly required: boolean;
};

async function validateOne(check: ArtifactCheck): Promise<ArtifactValidationResult> {
  const exists = await pathExists(check.path);

  if (!exists.ok) {
    return {
      path: check.displayPath,
      required: check.required,
      present: false,
      passed: false,
      errors: [exists.error.message],
      warnings: []
    };
  }

  if (!exists.value) {
    return {
      path: check.displayPath,
      required: check.required,
      present: false,
      passed: !check.required,
      errors: check.required ? [`Missing required artifact: ${check.displayPath}.`] : [],
      warnings: check.required ? [] : [`Optional artifact missing: ${check.displayPath}.`]
    };
  }

  const artifact = await readArtifact(check.path, check.schema, {
    artifactName: check.name
  });

  if (!artifact.ok) {
    return {
      path: check.displayPath,
      required: check.required,
      present: true,
      passed: false,
      errors: [artifact.error.message],
      warnings: []
    };
  }

  return {
    path: check.displayPath,
    required: check.required,
    present: true,
    passed: true,
    errors: [],
    warnings: []
  };
}

export async function validateArtifacts(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly taskId?: string;
}): Promise<ArtifactValidationSection> {
  const checks: ArtifactCheck[] = [
    {
      path: projectProfileArtifactPath(input.targetPath),
      displayPath: ".visp/project.json",
      schema: projectProfileSchema,
      name: "project profile",
      required: false
    },
    {
      path: projectConfigArtifactPath(input.targetPath),
      displayPath: ".visp/config.json",
      schema: projectConfigSchema,
      name: "project config",
      required: false
    },
    {
      path: projectStatusArtifactPath(input.targetPath),
      displayPath: ".visp/status.json",
      schema: projectStatusSchema,
      name: "project status",
      required: false
    },
    {
      path: featureIntentArtifactPath(input.targetPath, input.featureKey),
      displayPath: `${relativePath(input.targetPath, featureIntentArtifactPath(input.targetPath, input.featureKey))}`,
      schema: featureIntentSchema,
      name: "feature intent",
      required: true
    },
    {
      path: specArtifactPath(input.targetPath, input.featureKey),
      displayPath: relativePath(
        input.targetPath,
        specArtifactPath(input.targetPath, input.featureKey)
      ),
      schema: specArtifactSchema,
      name: "spec",
      required: false
    },
    {
      path: planArtifactPath(input.targetPath, input.featureKey),
      displayPath: relativePath(
        input.targetPath,
        planArtifactPath(input.targetPath, input.featureKey)
      ),
      schema: planDraftArtifactSchema,
      name: "plan",
      required: false
    },
    {
      path: taskGraphArtifactPath(input.targetPath, input.featureKey),
      displayPath: relativePath(
        input.targetPath,
        taskGraphArtifactPath(input.targetPath, input.featureKey)
      ),
      schema: taskGraphArtifactSchema,
      name: "task graph",
      required: true
    },
    {
      path: traceabilityArtifactPath(input.targetPath, input.featureKey),
      displayPath: relativePath(
        input.targetPath,
        traceabilityArtifactPath(input.targetPath, input.featureKey)
      ),
      schema: traceabilityMatrixSchema,
      name: "traceability",
      required: false
    },
    {
      path: verificationArtifactPath(input.targetPath, input.featureKey),
      displayPath: relativePath(
        input.targetPath,
        verificationArtifactPath(input.targetPath, input.featureKey)
      ),
      schema: verificationReportSchema,
      name: "verification report",
      required: false
    }
  ];

  if (input.taskId !== undefined) {
    checks.push({
      path: contextPackArtifactPath(input.targetPath, input.featureKey, input.taskId),
      displayPath: relativePath(
        input.targetPath,
        contextPackArtifactPath(input.targetPath, input.featureKey, input.taskId)
      ),
      schema: contextPackSchema,
      name: "context pack",
      required: false
    });
  }

  const checked = await Promise.all(checks.map(validateOne));
  const errors = checked.flatMap((result) => result.errors);
  const warnings = checked.flatMap((result) => result.warnings);

  return {
    status: errors.length > 0 ? "failed" : warnings.length > 0 ? "warned" : "passed",
    checked,
    warnings,
    errors
  };
}
