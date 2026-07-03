import { type WorkflowManifest } from "../artifacts/schemas/workflow.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

export function renderWorkflowMarkdown(manifest: WorkflowManifest): string {
  return [
    "# Visp Workflow Manifest",
    "",
    "## Principles",
    "",
    ...manifest.principles.map((principle) => `- ${principle}`),
    "",
    "## Stages",
    "",
    "| Stage | Command | Gate | Source edits | Next |",
    "|-------|---------|------|--------------|------|",
    ...manifest.stages.map(
      (stage) =>
        `| ${stage.name} | \`${stage.command}\` | ${stage.gateStage ?? "none"} | ${stage.sourceEditsAllowed ? "yes" : "no"} | \`${stage.nextCommand}\` |`
    ),
    ""
  ].join("\n");
}

export function formatWorkflowSummary(input: {
  readonly manifest: WorkflowManifest;
  readonly exists: boolean;
  readonly valid: boolean;
  readonly warnings: readonly string[];
}): string {
  const lines = [
    formatHeader("Visp workflow"),
    "",
    formatKeyValue("Manifest", input.exists ? "project" : "built-in"),
    formatKeyValue("Valid", input.valid ? "yes" : "no"),
    formatKeyValue("Stages", String(input.manifest.stages.length)),
    "",
    "Stages:",
    ...input.manifest.stages.map((stage) => `  ${stage.name}: ${stage.command}`)
  ];

  if (input.warnings.length > 0) {
    lines.push("", "Warnings:", ...input.warnings.map((warning) => `  ${warning}`));
  }

  return `${lines.join("\n")}\n`;
}
