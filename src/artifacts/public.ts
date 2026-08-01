export * from "./artifact-accessors.js";
export * from "./artifact-paths.js";
export * from "./artifact-reader.js";
export * from "./schemas/index.js";

import { assuranceCaseSchema } from "./schemas/assurance-case.schema.js";
import { baselineEvidenceSchema } from "./schemas/baseline-evidence.schema.js";
import { candidateEvidenceSchema } from "./schemas/candidate-evidence.schema.js";
import { clarificationArtifactSchema } from "./schemas/clarification.schema.js";
import { contextPackSchema } from "./schemas/context-pack.schema.js";
import { constitutionArtifactSchema } from "./schemas/constitution.schema.js";
import { diffSnapshotSchema } from "./schemas/diff-snapshot.schema.js";
import { featureIntentSchema, featureSchema } from "./schemas/feature.schema.js";
import { planDraftArtifactSchema } from "./schemas/plan.schema.js";
import { overrideArtifactSchema } from "./schemas/override.schema.js";
import { policyArtifactSchema } from "./schemas/policy.schema.js";
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
import { runArtifactSchema, runEventSchema, runIndexSchema } from "./schemas/run.schema.js";
import { specArtifactSchema } from "./schemas/spec.schema.js";
import { taskGraphArtifactSchema } from "./schemas/task.schema.js";
import { traceabilityMatrixSchema } from "./schemas/traceability.schema.js";
import { verificationReportSchema } from "./schemas/verification.schema.js";
import { workflowManifestSchema } from "./schemas/workflow.schema.js";

export const artifactSchemas = {
  projectProfile: projectProfileSchema,
  projectConfig: projectConfigSchema,
  projectStatus: projectStatusSchema,
  policy: policyArtifactSchema,
  overrides: overrideArtifactSchema,
  constitutionArtifact: constitutionArtifactSchema,
  workflowManifest: workflowManifestSchema,
  feature: featureSchema,
  featureIntent: featureIntentSchema,
  clarifications: clarificationArtifactSchema,
  specification: specArtifactSchema,
  plan: planDraftArtifactSchema,
  taskGraph: taskGraphArtifactSchema,
  traceability: traceabilityMatrixSchema,
  contextPack: contextPackSchema,
  verification: verificationReportSchema,
  featureReview: reviewReportSchema,
  reconcile: reconcileReportSchema,
  pr: prArtifactSchema,
  diffSnapshot: diffSnapshotSchema,
  baselineEvidence: baselineEvidenceSchema,
  candidateEvidence: candidateEvidenceSchema,
  assuranceCase: assuranceCaseSchema,
  currentReviewDecision: currentReviewDecisionPointerSchema,
  reviewDecision: reviewDecisionSchema,
  runIndex: runIndexSchema,
  run: runArtifactSchema,
  runEvent: runEventSchema
} as const;

export type ArtifactSchemaName = keyof typeof artifactSchemas;
