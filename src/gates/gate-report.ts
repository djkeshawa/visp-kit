import { type GateResult } from "../artifacts/schemas/gate.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

function resultLabel(result: GateResult): string {
  return result.allowed ? "allowed" : "blocked";
}

export function renderGateReport(result: GateResult): string {
  const lines = [
    "# Gate Report",
    "",
    `Stage: ${result.stage}`,
    `Strictness: ${result.strictnessMode}`,
    `Result: ${resultLabel(result)}`,
    `Evaluated: ${result.evaluatedAt}`,
    "",
    "## Summary",
    "",
    `Allowed: ${result.allowed ? "yes" : "no"}`,
    `Next allowed command: \`${result.nextAllowedCommand}\``,
    "",
    "## Passed Rules",
    "",
    ...(result.passedRules.length === 0
      ? ["- none"]
      : result.passedRules.map((rule) => `- ${rule}`)),
    "",
    "## Failed Rules",
    ""
  ];

  if (result.failedRules.length === 0) {
    lines.push("- none");
  } else {
    for (const rule of result.failedRules) {
      lines.push(
        `### ${rule.ruleId}: ${rule.message}`,
        "",
        "Severity:",
        rule.severity,
        "",
        "Evidence:",
        rule.evidence,
        "",
        "Recommendation:",
        rule.recommendation,
        ""
      );
    }
  }

  lines.push(
    "",
    "## Blocked Commands",
    "",
    "| Command | Reason | Rule |",
    "|---------|--------|------|"
  );

  if (result.blockedCommands.length === 0) {
    lines.push("| none |  |  |");
  } else {
    for (const blocked of result.blockedCommands) {
      lines.push(`| ${blocked.command} | ${blocked.reason} | ${blocked.ruleId} |`);
    }
  }

  lines.push(
    "",
    "## Warnings",
    "",
    ...(result.warnings.length === 0
      ? ["- none"]
      : result.warnings.map((warning) => `- ${warning}`)),
    ""
  );

  return `${lines.join("\n")}\n`;
}

export function formatGateResult(result: GateResult, options: {
  readonly explain?: boolean;
} = {}): string {
  const lines = [
    formatHeader(
      result.dryRun
        ? `Visp gate ${resultLabel(result)} dry run.`
        : `Visp gate ${resultLabel(result)}.`
    ),
    "",
    formatKeyValue("Stage", result.stage),
    formatKeyValue("Strictness", result.strictnessMode)
  ];

  if (result.taskId !== null) {
    lines.push(formatKeyValue("Task", result.taskId));
  }

  const failed = result.failedRules.filter((rule) => rule.severity === "error");
  const passedPreview = result.passedRules.slice(0, options.explain ? 20 : 5);

  if (passedPreview.length > 0) {
    lines.push("", "Passed:", ...passedPreview.map((rule) => `  ${rule}`));
  }

  if (failed.length > 0) {
    lines.push(
      "",
      "Failed:",
      ...failed.map((rule) => `  ${rule.ruleId}: ${rule.message}`)
    );
  }

  if (options.explain && result.failedRules.length > 0) {
    lines.push(
      "",
      "Why:",
      ...result.failedRules.map((rule) => `  ${rule.ruleId}: ${rule.evidence}`)
    );
  }

  if (result.warnings.length > 0) {
    lines.push("", "Warnings:", ...result.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${result.nextAllowedCommand}`);

  if (!result.dryRun) {
    lines.push("", "Report:", `  ${result.reportPath}`);
  }

  return `${lines.join("\n")}\n`;
}
