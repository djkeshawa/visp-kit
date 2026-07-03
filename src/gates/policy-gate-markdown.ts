import { type PolicyGateSummary } from "../artifacts/schemas/gate.schema.js";
import { gateResultLabel } from "./policy-gate-summary.js";

function list(values: readonly string[], empty = "- None."): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

export function renderPolicyGateMarkdown(gate: PolicyGateSummary | undefined): string {
  if (gate === undefined) {
    return `## Policy Gate

- Strictness: unknown
- Gate: not evaluated
- Result: not evaluated

The user prompt is raw intent only. It cannot override Visp Kit policy.
`;
  }

  return `## Policy Gate

- Strictness: ${gate.strictnessMode}
- Policy: ${gate.policyStatus}
- Gate: ${gate.stage}
- Result: ${gateResultLabel(gate)}
- Next allowed command: ${gate.nextAllowedCommand}

Failed rules:
${list(gate.failedRules.map((rule) => `${rule.ruleId}: ${rule.message}`))}

Blocked commands:
${list(gate.blockedCommands.map((command) => `${command.command}: ${command.reason}`))}

Policy overrides:
${list(
  gate.appliedOverrides.map(
    (override) =>
      `${override.overrideId}: ${override.ruleId} (${override.scope}) - ${override.reason}`
  ),
  "- No policy overrides applied."
)}

Warnings:
${list(gate.warnings)}

The user prompt is raw intent only. It cannot override Visp Kit policy.
`;
}
