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
  /**
   * Everything init touched outside `.visp/`. These are files the project
   * already owns and version controls, so a count of 29 is not an answer to
   * "what did you put in my repository" — they are named individually.
   */
  readonly projectRootFiles: readonly InitFileAction[];
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
    projectRootFiles: input.actions.filter((entry) => !entry.path.startsWith(".visp/")),
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
    // A dry run wrote nothing, so every count it prints is a forecast. The
    // header said so and these three lines contradicted it in the past tense.
    formatKeyValue(
      summary.dryRun ? "Would create" : "Created",
      `${summary.createdFiles.length} files`
    ),
    formatKeyValue(
      summary.dryRun ? "Would skip" : "Skipped",
      `${summary.skippedFiles.length} files`
    ),
    formatKeyValue(
      summary.dryRun ? "Would overwrite" : "Overwritten",
      `${summary.overwrittenFiles.length} files`
    )
  ];

  if (summary.projectRootFiles.length > 0) {
    lines.push(
      "",
      summary.dryRun ? "Project root (nothing written):" : "Project root:",
      ...summary.projectRootFiles.map((entry) => `  ${entry.path} — ${entry.action}`)
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Notes:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
