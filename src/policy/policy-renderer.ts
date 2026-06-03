import { type PolicyArtifact } from "../artifacts/schemas/policy.schema.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { policyRuleDefinitions } from "./policy-defaults.js";

export type PolicyRenderSummary = {
  readonly command: string;
  readonly targetPath: string;
  readonly policyPath: string;
  readonly source: "file" | "default";
  readonly policy: PolicyArtifact;
  readonly success: boolean;
  readonly dryRun: boolean;
  readonly created: boolean;
  readonly updated: boolean;
  readonly validation: {
    readonly passed: boolean;
    readonly errors: readonly string[];
  };
  readonly warnings: readonly string[];
  readonly nextCommand: string;
};

function enabledRules(policy: PolicyArtifact): readonly string[] {
  return policyRuleDefinitions
    .filter((rule) => policy.rules[rule.key])
    .map((rule) => `${rule.id} ${rule.name}`);
}

function disabledRules(policy: PolicyArtifact): number {
  return policyRuleDefinitions.length - enabledRules(policy).length;
}

export function formatPolicySummary(summary: PolicyRenderSummary): string {
  const lines = [
    formatHeader(
      summary.dryRun
        ? "Visp policy dry run."
        : summary.success
          ? "Visp policy ready."
          : "Visp policy failed."
    ),
    "",
    formatKeyValue("Path", summary.policyPath),
    formatKeyValue("Source", summary.source),
    formatKeyValue("Strictness", summary.policy.strictnessMode),
    formatKeyValue("Validation", summary.validation.passed ? "passed" : "failed")
  ];

  if (summary.created) {
    lines.push(formatKeyValue("Created", "yes"));
  }

  if (summary.updated) {
    lines.push(formatKeyValue("Updated", "yes"));
  }

  lines.push(
    "",
    "Rules:",
    ...enabledRules(summary.policy).map((rule) => `  enabled  ${rule}`),
    `  disabled ${disabledRules(summary.policy)} rule(s)`,
    "",
    "Limits:",
    `  maxChangedFilesPerTask: ${summary.policy.limits.maxChangedFilesPerTask}`,
    `  maxOutOfScopeFiles: ${summary.policy.limits.maxOutOfScopeFiles}`,
    `  maxVerificationFailuresBeforeStop: ${summary.policy.limits.maxVerificationFailuresBeforeStop}`,
    `  maxReviewErrors: ${summary.policy.limits.maxReviewErrors}`,
    `  maxReconcileErrors: ${summary.policy.limits.maxReconcileErrors}`,
    `  maxContextOverBudgetPercent: ${summary.policy.limits.maxContextOverBudgetPercent}`,
    "",
    "Overrides:",
    `  allowed: ${summary.policy.overrides.allowed ? "yes" : "no"}`,
    `  requireReason: ${summary.policy.overrides.requireReason ? "yes" : "no"}`,
    `  recordInReports: ${summary.policy.overrides.recordInReports ? "yes" : "no"}`
  );

  if (summary.validation.errors.length > 0) {
    lines.push(
      "",
      "Validation errors:",
      ...summary.validation.errors.map((error) => `  ${error}`)
    );
  }

  if (summary.warnings.length > 0) {
    lines.push("", "Warnings:", ...summary.warnings.map((warning) => `  ${warning}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
