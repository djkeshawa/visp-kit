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
  | "VSP020"
  | "VSP021"
  | "VSP022"
  | "VSP023"
  | "VSP024"
  | "VSP025";

export type GateRuleDefinition = {
  readonly id: GateRuleId;
  readonly key: keyof PolicyRules;
  readonly name: string;
  readonly description: string;
};

export const gateRuleDefinitions = policyRuleDefinitions as readonly GateRuleDefinition[];

const rulesById: ReadonlyMap<GateRuleId, GateRuleDefinition> = new Map(
  gateRuleDefinitions.map((rule) => [rule.id, rule])
);

export function ruleById(ruleId: GateRuleId): GateRuleDefinition | undefined {
  return rulesById.get(ruleId);
}
