import { type OverrideRecord } from "../artifacts/schemas/override.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { scopeLabel, type OverrideWorkflowSummary } from "./override-summary.js";

function row(override: OverrideRecord): string {
  return `${override.id} ${override.ruleId} ${scopeLabel(override)}\nReason: ${override.reason}\nExpires: ${override.expiresAt ?? "none"}`;
}

function overridesByStatus(
  overrides: readonly OverrideRecord[],
  status: OverrideRecord["status"]
): readonly OverrideRecord[] {
  return overrides.filter((override) => override.status === status);
}

function section(title: string, overrides: readonly OverrideRecord[]): readonly string[] {
  return [
    `${title}:`,
    ...(overrides.length === 0
      ? ["none"]
      : overrides.flatMap((override) => [row(override), ""]).slice(0, -1))
  ];
}

export function formatOverrideSummary(summary: OverrideWorkflowSummary): string {
  const lines = [
    formatHeader(
      summary.mode === "create"
        ? summary.dryRun
          ? "Visp override dry run."
          : "Visp override created."
        : summary.mode === "revoke"
          ? summary.dryRun
            ? "Visp override revoke dry run."
            : "Visp override revoked."
          : summary.mode === "validate"
            ? summary.success
              ? "Visp overrides valid."
              : "Visp overrides invalid."
            : "Visp overrides"
    ),
    "",
    formatKeyValue("Path", summary.overridesPath)
  ];

  if (summary.override !== null) {
    lines.push(
      formatKeyValue("Override", summary.override.id),
      formatKeyValue("Rule", summary.override.ruleId),
      formatKeyValue("Scope", scopeLabel(summary.override)),
      formatKeyValue("Reason", summary.override.reason)
    );
  }

  if (summary.mode === "list") {
    lines.push(
      "",
      ...section("Active", overridesByStatus(summary.overrides, "active")),
      "",
      ...section("Revoked", overridesByStatus(summary.overrides, "revoked")),
      "",
      ...section("Expired", overridesByStatus(summary.overrides, "expired"))
    );
  }

  if (summary.validation !== null) {
    lines.push(
      "",
      "Validation:",
      `  Active: ${summary.validation.counts.active}`,
      `  Revoked: ${summary.validation.counts.revoked}`,
      `  Expired: ${summary.validation.counts.expired}`
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  if (summary.errors.length > 0) {
    lines.push("", "Errors:", ...summary.errors.map((error) => `  ${error}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
