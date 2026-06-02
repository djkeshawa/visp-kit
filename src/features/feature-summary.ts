import {
  type BudgetMode,
  type FeatureStatus,
  type RiskLevel
} from "../artifacts/schemas/common.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { type FeatureBranchSummary } from "./git-branch.js";

export type FeatureFileAction = {
  readonly path: string;
  readonly action: "created" | "skipped" | "overwritten" | "updated";
};

export type FeatureSummary = {
  readonly success: true;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly title: string;
    readonly path: string;
    readonly status: FeatureStatus;
    readonly budgetMode: BudgetMode;
    readonly riskLevel: RiskLevel;
  };
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly updatedFiles: readonly string[];
  readonly branch: FeatureBranchSummary;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
  readonly nextCommand: "visp clarify";
};

export function createFeatureSummary(input: {
  readonly targetPath: string;
  readonly feature: FeatureSummary["feature"];
  readonly actions: readonly FeatureFileAction[];
  readonly branch: FeatureBranchSummary;
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
}): FeatureSummary {
  return {
    success: true,
    targetPath: input.targetPath,
    feature: input.feature,
    createdFiles: input.actions
      .filter((entry) => entry.action === "created")
      .map((entry) => entry.path),
    skippedFiles: input.actions
      .filter((entry) => entry.action === "skipped")
      .map((entry) => entry.path),
    overwrittenFiles: input.actions
      .filter((entry) => entry.action === "overwritten")
      .map((entry) => entry.path),
    updatedFiles: input.actions
      .filter((entry) => entry.action === "updated")
      .map((entry) => entry.path),
    branch: input.branch,
    dryRun: input.dryRun,
    warnings: input.warnings,
    nextCommand: "visp clarify"
  };
}

export function formatFeatureSummary(summary: FeatureSummary): string {
  const lines = [
    formatHeader(summary.dryRun ? "Visp feature dry run." : "Visp feature created."),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Title", summary.feature.title),
    formatKeyValue("Budget", summary.feature.budgetMode),
    formatKeyValue("Risk", summary.feature.riskLevel),
    ""
  ];

  if (summary.createdFiles.length > 0) {
    lines.push("Created:", ...summary.createdFiles.map((file) => `  ${file}`), "");
  }

  if (summary.overwrittenFiles.length > 0) {
    lines.push(
      "Overwritten:",
      ...summary.overwrittenFiles.map((file) => `  ${file}`),
      ""
    );
  }

  if (summary.updatedFiles.length > 0) {
    lines.push("Updated:", ...summary.updatedFiles.map((file) => `  ${file}`), "");
  }

  if (summary.branch.created && summary.branch.name !== null) {
    lines.push("Branch:", `  ${summary.branch.name}`, "");
  }

  if (summary.warnings.length > 0) {
    lines.push("Warnings:", ...summary.warnings.map((warning) => `  ${warning}`), "");
  }

  lines.push("Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
