import {
  requirementPrioritySchema,
  requirementSourceSchema,
  riskLevelSchema,
  taskStatusSchema,
  validationMethodSchema
} from "../artifacts/schemas/common.schema.js";
import {
  type ClarificationAssumption,
  type ClarificationQuestion,
  clarificationQuestionCategorySchema
} from "../artifacts/schemas/clarification.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type Requirement } from "../artifacts/schemas/requirement.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";

type PlanDraftDecision = PlanDraftArtifact["decisions"][number];
type PlanDraftRisk = PlanDraftArtifact["risks"][number];

export const requirementExample = {
  id: "REQ001",
  featureId: "001",
  title: "Short requirement title",
  description: "What the system must do and why.",
  source: "user",
  priority: "must",
  acceptanceCriteria: [
    {
      id: "AC001",
      requirementId: "REQ001",
      description: "Observable behavior that proves REQ001 is met.",
      testable: true,
      validationMethod: "unit"
    }
  ],
  assumptions: [{ id: "ASM001", description: "Assumption the requirement relies on." }],
  outOfScope: []
} satisfies Requirement;

export const planDecisionExample = {
  id: "PD001",
  title: "Short decision title",
  decision: "What was decided.",
  reason: "Why this option was chosen.",
  evidence: "spec.json REQ001; src/notes/store.ts",
  impacts: "Which modules or behaviors this changes.",
  requirementIds: ["REQ001"]
} satisfies PlanDraftDecision;

export const planRiskExample = {
  id: "RK001",
  description: "What could go wrong.",
  level: "medium",
  mitigation: "How the plan reduces this risk.",
  requirementIds: ["REQ001"]
} satisfies PlanDraftRisk;

export const taskExample = {
  id: "T001",
  title: "Short task title",
  description: "One implementation-sized change.",
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"],
  dependsOn: [],
  allowedFiles: ["src/notes/store.ts", "tests/unit/notes/store.test.ts"],
  validationCommands: ["pnpm test"],
  status: "pending",
  parallelizable: false,
  riskLevel: "low"
} satisfies Task;

export const clarificationQuestionExample = {
  id: "CQ001",
  question: "One blocking question the implementation depends on.",
  category: "behavior",
  blocking: true,
  recommendedDefault: "The default answer to use if the user does not reply.",
  reason: "Why the implementation cannot proceed without this answer.",
  status: "unanswered",
  answer: ""
} satisfies ClarificationQuestion;

export const clarificationAssumptionExample = {
  id: "ASM001",
  text: "A safe assumption that does not need a question.",
  reason: "Why this is safe to assume.",
  source: "intent",
  accepted: true
} satisfies ClarificationAssumption;

export function enumLine(
  label: string,
  schema: { readonly options: readonly string[] }
): string {
  return `- ${label}: ${schema.options.join(" | ")}`;
}

export function jsonBlock(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

export function specFieldValuesSection(): string {
  return [
    "Field values (exact, no other values are valid):",
    enumLine("source", requirementSourceSchema),
    enumLine("priority", requirementPrioritySchema),
    `${enumLine("validationMethod", validationMethodSchema)}  (manual = review-only, unit = ordinary automated test)`,
    "- IDs: REQ001, AC001, ASM001 - zero-padded and sequential. Each AC references its requirement via requirementId.",
    "",
    "Example requirement entry in spec.json:",
    jsonBlock(requirementExample)
  ].join("\n");
}

export function planFieldValuesSection(): string {
  return [
    "Field values (exact, no other values are valid):",
    enumLine("risk level", riskLevelSchema),
    "- IDs: PD001 for decisions, RK001 for risks - zero-padded and sequential.",
    "",
    "Example decision entry in plan.json:",
    jsonBlock(planDecisionExample),
    "",
    "Example risk entry in plan.json:",
    jsonBlock(planRiskExample)
  ].join("\n");
}

export function tasksFieldValuesSection(): string {
  return [
    "Field values (exact, no other values are valid):",
    enumLine("status", taskStatusSchema),
    enumLine("riskLevel", riskLevelSchema),
    "- IDs: T001, T002 - zero-padded and sequential. New tasks start as status \"pending\".",
    "",
    "Example task entry in task-graph.json:",
    jsonBlock(taskExample)
  ].join("\n");
}

export function clarifyFieldValuesSection(): string {
  return [
    "Field values (exact, no other values are valid):",
    enumLine("category", clarificationQuestionCategorySchema),
    "- status: new questions start as \"unanswered\" with answer set to \"\".",
    "- IDs: CQ001 for questions, ASM001 for assumptions - zero-padded and sequential.",
    "",
    "Example question entry in clarifications.json:",
    jsonBlock(clarificationQuestionExample),
    "",
    "Example assumption entry in clarifications.json:",
    jsonBlock(clarificationAssumptionExample)
  ].join("\n");
}

export const editSeededJsonInstruction =
  "Edit the seeded JSON files in place: replace placeholder values, clone an existing array entry to add another, and do not add or rename fields.";
