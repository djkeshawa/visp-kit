import { type BudgetMode, type Preset } from "../artifacts/schemas/common.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { type CompactValidationResult } from "./validate-compact-constitution.js";

export type ConstitutionFileAction = {
  readonly path: string;
  readonly action: "created" | "skipped" | "overwritten";
};

export type ConstitutionSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly dryRun: boolean;
  readonly validation: CompactValidationResult;
  readonly warnings: readonly string[];
  readonly nextCommand: 'visp feature "Describe your feature"';
};

export function createConstitutionSummary(input: {
  readonly targetPath: string;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly actions: readonly ConstitutionFileAction[];
  readonly dryRun: boolean;
  readonly validation: CompactValidationResult;
  readonly warnings: readonly string[];
}): ConstitutionSummary {
  return {
    success: input.validation.passed,
    targetPath: input.targetPath,
    preset: input.preset,
    budget: input.budget,
    createdFiles: input.actions
      .filter((entry) => entry.action === "created")
      .map((entry) => entry.path),
    skippedFiles: input.actions
      .filter((entry) => entry.action === "skipped")
      .map((entry) => entry.path),
    overwrittenFiles: input.actions
      .filter((entry) => entry.action === "overwritten")
      .map((entry) => entry.path),
    dryRun: input.dryRun,
    validation: input.validation,
    warnings: input.warnings,
    nextCommand: 'visp feature "Describe your feature"'
  };
}

export function formatConstitutionSummary(summary: ConstitutionSummary): string {
  const lines = [
    formatHeader("Visp constitution complete."),
    "",
    formatKeyValue("Target", summary.targetPath),
    formatKeyValue("Preset", summary.preset),
    formatKeyValue("Budget", summary.budget),
    "",
    formatKeyValue("Created", `${summary.createdFiles.length} files`),
    formatKeyValue("Skipped", `${summary.skippedFiles.length} files`),
    formatKeyValue("Overwritten", `${summary.overwrittenFiles.length} files`),
    formatKeyValue("Validation", summary.validation.passed ? "passed" : "failed")
  ];

  if (summary.validation.errors.length > 0) {
    lines.push("", "Validation errors:", ...summary.validation.errors.map((error) => `  ${error}`));
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
