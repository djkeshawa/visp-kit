import {
  type AgentMode,
  type BudgetMode,
  type Preset
} from "../../artifacts/schemas/common.schema.js";
import { formatHeader, formatKeyValue } from "../../theme/terminal.js";

export type InitFileAction = {
  readonly path: string;
  readonly action: "created" | "skipped" | "overwritten" | "updated";
};

export type InitSummary = {
  readonly targetPath: string;
  readonly agent: AgentMode;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly createdFiles: readonly string[];
  readonly skippedFiles: readonly string[];
  readonly overwrittenFiles: readonly string[];
  readonly dryRun: boolean;
  readonly success: boolean;
  readonly nextCommand: "visp-kit scan";
  readonly warnings: readonly string[];
};

export function createInitSummary(input: {
  readonly targetPath: string;
  readonly agent: AgentMode;
  readonly preset: Preset;
  readonly budget: BudgetMode;
  readonly actions: readonly InitFileAction[];
  readonly dryRun: boolean;
  readonly warnings: readonly string[];
}): InitSummary {
  return {
    targetPath: input.targetPath,
    agent: input.agent,
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
    success: true,
    nextCommand: "visp-kit scan",
    warnings: input.warnings
  };
}

export function formatInitSummary(summary: InitSummary): string {
  const lines = [
    formatHeader(summary.dryRun ? "Visp Kit init dry run." : "Visp Kit initialized."),
    "",
    formatKeyValue("Target", summary.targetPath),
    formatKeyValue("Agent", summary.agent),
    formatKeyValue("Preset", summary.preset),
    formatKeyValue("Budget", summary.budget),
    "",
    formatKeyValue("Created", `${summary.createdFiles.length} files`),
    formatKeyValue("Skipped", `${summary.skippedFiles.length} files`),
    formatKeyValue("Overwritten", `${summary.overwrittenFiles.length} files`)
  ];

  if (summary.warnings.length > 0) {
    lines.push("", "Notes:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
