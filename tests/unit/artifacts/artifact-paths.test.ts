import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  budgetArtifactPath,
  doctorReportArtifactPath,
  constitutionArtifactPath,
  contextPackArtifactPath,
  featureArtifactPath,
  featurePrArtifactPath,
  featurePrMarkdownPath,
  oracleApprovalArtifactPath,
  oracleLockArtifactPath,
  oraclePlanArtifactPath,
  planArtifactPath,
  projectConfigArtifactPath,
  projectProfileArtifactPath,
  projectStatusArtifactPath,
  requirementsArtifactPath,
  statusReportArtifactPath,
  taskReconcileArtifactPath,
  taskReconcileMarkdownPath,
  taskReconcilePromptPath,
  taskReviewArtifactPath,
  taskReviewChecklistPath,
  taskReviewMarkdownPath,
  taskReviewPromptPath,
  taskGraphArtifactPath,
  traceabilityArtifactPath,
  verificationArtifactPath,
  verificationMarkdownPath
} from "../../../src/artifacts/artifact-paths.js";

describe("artifact paths", () => {
  it("builds top-level artifact paths without creating files", () => {
    const root = path.join(path.sep, "workspace", "app");

    expect(projectProfileArtifactPath(root)).toBe(path.join(root, ".visp", "project.json"));
    expect(projectConfigArtifactPath(root)).toBe(path.join(root, ".visp", "config.json"));
    expect(projectStatusArtifactPath(root)).toBe(path.join(root, ".visp", "status.json"));
    expect(constitutionArtifactPath(root)).toBe(
      path.join(root, ".visp", "memory", "constitution.json")
    );
    expect(budgetArtifactPath(root)).toBe(path.join(root, ".visp", "budget.json"));
    expect(statusReportArtifactPath(root)).toBe(
      path.join(root, ".visp", "reports", "status-report.md")
    );
    expect(doctorReportArtifactPath(root)).toBe(
      path.join(root, ".visp", "reports", "doctor-report.md")
    );
  });

  it("builds feature artifact paths", () => {
    const root = path.join(path.sep, "workspace", "app");
    const featureKey = "001-note-pinning";

    expect(featureArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "feature.json")
    );
    expect(requirementsArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "requirements.json")
    );
    expect(planArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "plan.json")
    );
    expect(taskGraphArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "task-graph.json")
    );
    expect(contextPackArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "context", "T001.context.json")
    );
    expect(oraclePlanArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "assurance", "T001", "oracle-plan.json")
    );
    expect(oracleApprovalArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "assurance", "T001", "oracle-approval.json")
    );
    expect(oracleLockArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "assurance", "T001", "oracle-lock.json")
    );
    expect(verificationArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "verification.json")
    );
    expect(verificationMarkdownPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "verification.md")
    );
    expect(taskReviewArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "review", "T001.review.json")
    );
    expect(taskReviewMarkdownPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "review", "T001.review.md")
    );
    expect(taskReviewPromptPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "review", "T001.review-prompt.md")
    );
    expect(taskReviewChecklistPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "review", "T001.review-checklist.md")
    );
    expect(taskReconcileArtifactPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "reconcile", "T001.reconcile.json")
    );
    expect(taskReconcileMarkdownPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "reconcile", "T001.reconcile.md")
    );
    expect(taskReconcilePromptPath(root, featureKey, "T001")).toBe(
      path.join(root, ".visp", "features", featureKey, "reconcile", "T001.reconcile-prompt.md")
    );
    expect(featurePrArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "pr.json")
    );
    expect(featurePrMarkdownPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "pr.md")
    );
    expect(traceabilityArtifactPath(root, featureKey)).toBe(
      path.join(root, ".visp", "features", featureKey, "traceability.json")
    );
  });
});
