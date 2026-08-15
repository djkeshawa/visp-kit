/**
 * What the action concludes, and why.
 *
 * `verdict` is deliberately the only place a "ready" is produced: it is ready
 * only when nothing was found and nothing contradicted the decision. Any
 * finding at all downgrades it, so a new check cannot be added that reports a
 * problem while still letting the action read as ready.
 */
import { type PolicyStatus } from "../artifacts/schemas/gate.schema.js";
import { type NextStep } from "../orchestrator/next-step.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { type Sha256Hash } from "./canonical-json.js";
import {
  type AddFinding,
  available,
  canonicalFindingReference,
  unavailable
} from "./canonical-workflow-action.findings.js";
import {
  type ActionVerdict,
  type DeclaredValue,
  type Finding
} from "./canonical-workflow-action.types.js";

export function policyStatus(
  state: ProjectState,
  addFinding: AddFinding
): DeclaredValue<PolicyStatus> {
  const direct = state.contextPack?.policyStatus;
  const gate = state.contextPack?.policyGate?.policyStatus;
  if (direct !== undefined && gate !== undefined && direct !== gate) {
    addFinding(
      {
        code: "VISP.CONTRACT.POLICY_STATUS_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "Context policy status and gate policy status disagree.",
        recommendation: "Regenerate context from one coherent policy evaluation.",
        evidence: [direct, gate]
      },
      true
    );
    return unavailable("source_invalid");
  }
  const value = direct ?? gate;
  return value === undefined ? unavailable("not_captured") : available(value);
}

export function stepFindings(
  step: NextStep,
  addFinding: AddFinding,
  v2FindingOrder: Sha256Hash[]
): void {
  const failedRules = step.failedRules ?? [];
  const hasBlockingRule = failedRules.some((rule) => rule.severity === "error");

  if (step.nextAllowedCommand !== undefined && step.nextAllowedCommand !== step.nextCommand) {
    addFinding(
      {
        code: "VISP.CONTRACT.NEXT_COMMAND_MISMATCH",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The evaluated next command disagrees with the authoritative allowed command.",
        recommendation: "Re-evaluate the authoritative Kit gate for the exact next action.",
        evidence: [step.nextCommand, step.nextAllowedCommand]
      },
      true
    );
  }

  for (const rule of failedRules) {
    addFinding({
      code: rule.ruleId,
      source: "policy",
      severity: rule.severity,
      effect: step.allowed === false && rule.severity === "error" ? "blocks" : "none",
      message: rule.message,
      recommendation: rule.recommendation,
      evidence: [rule.evidence]
    });
  }

  if (step.allowed === undefined || (step.allowed === false && !hasBlockingRule)) {
    addFinding(
      {
        code: "VISP.CONTRACT.AUTHORITY_UNAVAILABLE",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: "The next-step input does not contain a coherent permission decision.",
        recommendation: "Re-evaluate the authoritative Kit gate for the exact next action.",
        evidence: [step.nextCommand]
      },
      true
    );
  }

  for (const blocker of step.blockers) {
    const finding: Finding = {
      code: "VISP.WORKFLOW.STATE_BLOCKER",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: blocker,
      recommendation: step.nextCommand,
      evidence: [blocker]
    };
    addFinding(finding);
    if (step.allowed === false) {
      v2FindingOrder.push(canonicalFindingReference(finding));
    }
  }
  for (const warning of step.warnings) {
    addFinding({
      code: "VISP.WORKFLOW.WARNING",
      source: "workflow",
      severity: "warning",
      effect: "none",
      message: warning,
      recommendation: step.nextCommand,
      evidence: [warning]
    });
  }
}

export function verdict(
  findings: readonly Finding[],
  decisionContradiction: boolean
): ActionVerdict {
  if (decisionContradiction) return "inconclusive";
  if (findings.some((finding) => finding.effect === "blocks")) return "blocked";
  if (findings.some((finding) => finding.effect === "uncertain")) return "inconclusive";
  return "ready";
}
