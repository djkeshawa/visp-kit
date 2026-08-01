import path from "node:path";

import { z } from "zod";

import {
  assuranceCaseArtifactPath,
  baselineEvidenceArtifactPath,
  candidateEvidenceArtifactPath,
  clarificationsArtifactPath,
  constitutionArtifactPath,
  constitutionMarkdownArtifactPath,
  contextPackArtifactPath,
  currentReviewDecisionArtifactPath,
  diffSnapshotArtifactPath,
  doctorReportArtifactPath,
  featureArtifactPath,
  featureIntentArtifactPath,
  featurePrArtifactPath,
  featureReconcileArtifactPath,
  featureReviewArtifactPath,
  patternsArtifactPath,
  planArtifactPath,
  overridesArtifactPath,
  policyArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  projectSummaryArtifactPath,
  reviewDecisionHistoryArtifactPath,
  runArtifactPath,
  runIndexArtifactPath,
  specArtifactPath,
  taskGraphArtifactPath,
  taskReviewArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath,
  workflowManifestArtifactPath
} from "./artifact-paths.js";
import {
  readContainedArtifactState,
  readContainedTextArtifactState,
  type ReadArtifactStateOptions
} from "./artifact-reader.js";
import { assuranceCaseSchema } from "./schemas/assurance-case.schema.js";
import { baselineEvidenceSchema } from "./schemas/baseline-evidence.schema.js";
import { candidateEvidenceSchema } from "./schemas/candidate-evidence.schema.js";
import { clarificationArtifactSchema } from "./schemas/clarification.schema.js";
import { contextPackSchema } from "./schemas/context-pack.schema.js";
import { constitutionArtifactSchema } from "./schemas/constitution.schema.js";
import { diffSnapshotSchema } from "./schemas/diff-snapshot.schema.js";
import { featureIntentSchema, featureSchema } from "./schemas/feature.schema.js";
import { planDraftArtifactSchema } from "./schemas/plan.schema.js";
import { policyArtifactSchema } from "./schemas/policy.schema.js";
import { overrideArtifactSchema } from "./schemas/override.schema.js";
import { prArtifactSchema } from "./schemas/pr.schema.js";
import {
  projectConfigSchema,
  projectProfileSchema,
  projectStatusSchema
} from "./schemas/project.schema.js";
import { reconcileReportSchema } from "./schemas/reconcile.schema.js";
import {
  currentReviewDecisionPointerSchema,
  reviewDecisionSchema
} from "./schemas/review-decision.schema.js";
import { reviewReportSchema } from "./schemas/review.schema.js";
import { runArtifactSchema, runIndexSchema } from "./schemas/run.schema.js";
import { specArtifactSchema } from "./schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "./schemas/task.schema.js";
import { traceabilityMatrixSchema } from "./schemas/traceability.schema.js";
import { verificationReportSchema } from "./schemas/verification.schema.js";
import { workflowManifestSchema } from "./schemas/workflow.schema.js";

const textArtifactSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "Text artifact must contain non-whitespace content.");

// Mirrors idSchema in common.schema.ts, colon included. A stricter rule here
// makes a public accessor refuse to read a file Kit itself wrote: `T:001` is a
// schema-valid task id, and a colon is a legal filename character that still
// produces exactly one path segment, so containment is unaffected.
function safeArtifactSegment(label: string, value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value) || value === "." || value === "..") {
    throw new TypeError(`${label} must be one safe path segment.`);
  }
  return value;
}

function safeDecisionHash(value: string): string {
  if (!/^sha256:[a-f0-9]{64}$/u.test(value)) {
    throw new TypeError("Decision hash must be a prefixed lowercase SHA-256 digest.");
  }
  return value;
}

export function createArtifactReader(rootPath: string) {
  const resolvedRootPath = path.resolve(rootPath);
  const readArtifactState = <Output, Input = Output>(
    artifactPath: string,
    schema: z.ZodType<Output, z.ZodTypeDef, Input>,
    options?: ReadArtifactStateOptions
  ) => readContainedArtifactState(resolvedRootPath, artifactPath, schema, options);
  const readTextArtifactState = <Output, Input = Output>(
    artifactPath: string,
    schema: z.ZodType<Output, z.ZodTypeDef, Input>,
    options?: ReadArtifactStateOptions
  ) => readContainedTextArtifactState(resolvedRootPath, artifactPath, schema, options);

  return {
    rootPath: resolvedRootPath,
    projectProfile: (options?: ReadArtifactStateOptions) =>
      readArtifactState(
        projectProfileArtifactPath(resolvedRootPath),
        projectProfileSchema,
        options
      ),
    projectConfig: (options?: ReadArtifactStateOptions) =>
      readArtifactState(projectConfigArtifactPath(resolvedRootPath), projectConfigSchema, options),
    projectStatus: (options?: ReadArtifactStateOptions) =>
      readArtifactState(projectStatusArtifactPath(resolvedRootPath), projectStatusSchema, options),
    policy: (options?: ReadArtifactStateOptions) =>
      readArtifactState(policyArtifactPath(resolvedRootPath), policyArtifactSchema, options),
    overrides: (options?: ReadArtifactStateOptions) =>
      readArtifactState(overridesArtifactPath(resolvedRootPath), overrideArtifactSchema, options),
    constitutionArtifact: (options?: ReadArtifactStateOptions) =>
      readArtifactState(
        constitutionArtifactPath(resolvedRootPath),
        constitutionArtifactSchema,
        options
      ),
    workflowManifest: (options?: ReadArtifactStateOptions) =>
      readArtifactState(
        workflowManifestArtifactPath(resolvedRootPath),
        workflowManifestSchema,
        options
      ),
    feature: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        featureArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        featureSchema,
        options
      ),
    featureIntent: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        featureIntentArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        featureIntentSchema,
        options
      ),
    clarifications: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        clarificationsArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey)
        ),
        clarificationArtifactSchema,
        options
      ),
    specification: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        specArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        specArtifactSchema,
        options
      ),
    plan: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        planArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        planDraftArtifactSchema,
        options
      ),
    taskGraph: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        taskGraphArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        taskGraphArtifactSchema,
        options
      ),
    traceability: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        traceabilityArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        traceabilityMatrixSchema,
        options
      ),
    contextPack: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        contextPackArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        contextPackSchema,
        options
      ),
    verification: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        verificationArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        verificationReportSchema,
        options
      ),
    featureReview: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        featureReviewArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        reviewReportSchema,
        options
      ),
    taskReview: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        taskReviewArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        reviewReportSchema,
        options
      ),
    reconcile: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        featureReconcileArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey)
        ),
        reconcileReportSchema,
        options
      ),
    pr: (featureKey: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        featurePrArtifactPath(resolvedRootPath, safeArtifactSegment("Feature key", featureKey)),
        prArtifactSchema,
        options
      ),
    diffSnapshot: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        diffSnapshotArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        diffSnapshotSchema,
        options
      ),
    baselineEvidence: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        baselineEvidenceArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        baselineEvidenceSchema,
        options
      ),
    candidateEvidence: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        candidateEvidenceArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        candidateEvidenceSchema,
        options
      ),
    assuranceCase: (featureKey: string, taskId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        assuranceCaseArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        assuranceCaseSchema,
        options
      ),
    currentReviewDecision: (
      featureKey: string,
      taskId: string,
      options?: ReadArtifactStateOptions
    ) =>
      readArtifactState(
        currentReviewDecisionArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId)
        ),
        currentReviewDecisionPointerSchema,
        options
      ),
    reviewDecision: (
      featureKey: string,
      taskId: string,
      decisionHash: string,
      options?: ReadArtifactStateOptions
    ) =>
      readArtifactState(
        reviewDecisionHistoryArtifactPath(
          resolvedRootPath,
          safeArtifactSegment("Feature key", featureKey),
          safeArtifactSegment("Task ID", taskId),
          safeDecisionHash(decisionHash)
        ),
        reviewDecisionSchema,
        options
      ),
    runIndex: (options?: ReadArtifactStateOptions) =>
      readArtifactState(runIndexArtifactPath(resolvedRootPath), runIndexSchema, options),
    run: (runId: string, options?: ReadArtifactStateOptions) =>
      readArtifactState(
        runArtifactPath(resolvedRootPath, safeArtifactSegment("Run ID", runId)),
        runArtifactSchema,
        options
      ),
    projectSummary: (options?: ReadArtifactStateOptions) =>
      readTextArtifactState(
        projectSummaryArtifactPath(resolvedRootPath),
        textArtifactSchema,
        options
      ),
    patterns: (options?: ReadArtifactStateOptions) =>
      readTextArtifactState(patternsArtifactPath(resolvedRootPath), textArtifactSchema, options),
    constitution: (options?: ReadArtifactStateOptions) =>
      readTextArtifactState(
        constitutionMarkdownArtifactPath(resolvedRootPath),
        textArtifactSchema,
        options
      ),
    doctorReport: (options?: ReadArtifactStateOptions) =>
      readTextArtifactState(doctorReportArtifactPath(resolvedRootPath), textArtifactSchema, options)
  };
}

export type ArtifactReader = ReturnType<typeof createArtifactReader>;
