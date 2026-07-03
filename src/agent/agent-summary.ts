import { type AgentTarget } from "./agent-target.js";
import { type AgentBootstrapSummary } from "./agent-bootstrap.js";
import { type AgentInstallSummary } from "./agent-installer.js";
import { type AgentDoctorSummary } from "./agent-doctor.js";
import { type AgentRefreshSummary } from "./agent-refresh.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export type AgentListSummary = {
  readonly success: true;
  readonly targets: readonly (AgentTarget & { readonly status: "supported" })[];
};

function appendFiles(lines: string[], label: string, files: readonly string[]): void {
  if (files.length === 0) return;

  lines.push("", `${label}:`, ...files.map((file) => `  ${file}`));
}

export function formatAgentList(summary: AgentListSummary): string {
  return [
    formatHeader("Supported agent targets:"),
    ...summary.targets.map((target) => `  ${target.name.padEnd(7)} ${target.description}`)
  ]
    .join("\n")
    .concat("\n");
}

export function formatAgentInstall(summary: AgentInstallSummary): string {
  const title = summary.dryRun
    ? summary.command === "refresh"
      ? "Visp agent refresh dry run."
      : "Visp agent install dry run."
    : summary.command === "refresh"
      ? "Visp agent refreshed."
      : "Visp agent installed.";
  const lines = [
    formatHeader(title),
    "",
    formatKeyValue("Target", summary.target),
    formatKeyValue("Strictness", summary.strictnessMode)
  ];

  appendFiles(lines, "Created", summary.createdFiles);
  appendFiles(lines, "Updated", summary.updatedFiles);
  appendFiles(lines, "Overwritten", summary.overwrittenFiles);
  appendFiles(lines, "Skipped", summary.skippedFiles);

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", ...summary.nextInstructions.split("\n").map((line) => `  ${line}`));

  return `${lines.join("\n")}\n`;
}

export function formatAgentBootstrap(summary: AgentBootstrapSummary): string {
  const lines = [
    formatHeader(summary.dryRun ? "Visp agent bootstrap dry run." : "Visp agent bootstrapped."),
    "",
    formatKeyValue("Target", summary.target),
    formatKeyValue("Strictness", summary.strictnessMode),
    formatKeyValue("Initialized", summary.initialized ? "yes" : "already initialized")
  ];

  appendFiles(lines, "Created", [
    ...(summary.init?.createdFiles ?? []),
    ...summary.install.createdFiles
  ]);
  appendFiles(lines, "Updated", summary.install.updatedFiles);
  appendFiles(lines, "Overwritten", [
    ...(summary.init?.overwrittenFiles ?? []),
    ...summary.install.overwrittenFiles
  ]);
  appendFiles(lines, "Skipped", [
    ...(summary.init?.skippedFiles ?? []),
    ...summary.install.skippedFiles
  ]);

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push(
    "",
    "Next:",
    `  ${summary.nextCommand}`,
    ...summary.nextInstructions.split("\n").map((line) => `  ${line}`)
  );

  return `${lines.join("\n")}\n`;
}

export function formatAgentDoctor(summary: AgentDoctorSummary): string {
  const lines = [
    formatHeader("Visp agent doctor"),
    "",
    formatKeyValue("Result", summary.result),
    formatKeyValue("Targets", summary.targets.length > 0 ? summary.targets.join(", ") : "none")
  ];

  if (summary.findings.length > 0) {
    lines.push("", "Findings:");
    for (const finding of summary.findings) {
      lines.push(`  ${finding.id}: ${finding.title}`);
    }
  }

  appendFiles(lines, "Fixes applied", summary.fixesApplied);
  lines.push("", "Recommended:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}

export function formatAgentRefresh(summaries: readonly AgentRefreshSummary[]): string {
  if (summaries.length === 0) {
    return `${formatHeader("Visp agent refresh")}\n\nNo targets refreshed.\n`;
  }

  return summaries.map(formatAgentInstall).join("\n");
}
