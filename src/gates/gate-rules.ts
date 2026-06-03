import { type PolicyRules } from "../artifacts/schemas/policy.schema.js";
import { policyRuleDefinitions } from "../policy/policy-defaults.js";

export type GateRuleId =
  | "VSP001"
  | "VSP002"
  | "VSP003"
  | "VSP004"
  | "VSP005"
  | "VSP006"
  | "VSP007"
  | "VSP008"
  | "VSP009"
  | "VSP010"
  | "VSP011"
  | "VSP012"
  | "VSP013"
  | "VSP014"
  | "VSP015"
  | "VSP016"
  | "VSP017"
  | "VSP018"
  | "VSP019"
  | "VSP020";

export type GateRuleDefinition = {
  readonly id: GateRuleId;
  readonly key: keyof PolicyRules;
  readonly name: string;
  readonly description: string;
};

export const gateRuleDefinitions = policyRuleDefinitions as readonly GateRuleDefinition[];

export function ruleById(ruleId: GateRuleId): GateRuleDefinition {
  const rule = gateRuleDefinitions.find((candidate) => candidate.id === ruleId);

  if (rule === undefined) {
    throw new Error(`Unknown gate rule: ${ruleId}`);
  }

  return rule;
}
