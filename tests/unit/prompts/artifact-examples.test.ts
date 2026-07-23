import { describe, expect, it } from "vitest";

import {
  clarificationAssumptionSchema,
  clarificationQuestionSchema
} from "../../../src/artifacts/schemas/clarification.schema.js";
import {
  requirementPrioritySchema,
  requirementSourceSchema,
  taskStatusSchema,
  validationMethodSchema
} from "../../../src/artifacts/schemas/common.schema.js";
import {
  planDraftDecisionSchema,
  planDraftRiskSchema
} from "../../../src/artifacts/schemas/plan.schema.js";
import { requirementSchema } from "../../../src/artifacts/schemas/requirement.schema.js";
import { taskSchema } from "../../../src/artifacts/schemas/task.schema.js";
import {
  clarificationAssumptionExample,
  clarificationQuestionExample,
  clarifyFieldValuesSection,
  enumLine,
  planDecisionExample,
  planFieldValuesSection,
  planRiskExample,
  requirementExample,
  specFieldValuesSection,
  taskExample,
  tasksFieldValuesSection
} from "../../../src/prompts/artifact-examples.js";

describe("artifact examples", () => {
  it("every example parses with its schema", () => {
    expect(requirementSchema.safeParse(requirementExample).success).toBe(true);
    expect(planDraftDecisionSchema.safeParse(planDecisionExample).success).toBe(true);
    expect(planDraftRiskSchema.safeParse(planRiskExample).success).toBe(true);
    expect(taskSchema.safeParse(taskExample).success).toBe(true);
    expect(clarificationQuestionSchema.safeParse(clarificationQuestionExample).success).toBe(true);
    expect(clarificationAssumptionSchema.safeParse(clarificationAssumptionExample).success).toBe(
      true
    );
  });

  it("enum lines list the exact schema options", () => {
    expect(enumLine("source", requirementSourceSchema)).toBe(
      "- source: user | clarification | derived"
    );
    expect(enumLine("priority", requirementPrioritySchema)).toBe(
      "- priority: must | should | could"
    );
    expect(enumLine("validationMethod", validationMethodSchema)).toBe(
      "- validationMethod: unit | integration | e2e | manual | static"
    );
    expect(enumLine("status", taskStatusSchema)).toBe(
      "- status: pending | ready | in_progress | blocked | done | verified"
    );
  });

  it("field value sections contain fenced JSON examples", () => {
    for (const section of [
      specFieldValuesSection(),
      planFieldValuesSection(),
      tasksFieldValuesSection(),
      clarifyFieldValuesSection()
    ]) {
      expect(section).toContain("```json");
      expect(section).toContain("Field values (exact, no other values are valid):");
    }

    expect(specFieldValuesSection()).toContain('"requirementId": "REQ001"');
    expect(tasksFieldValuesSection()).toContain('"id": "T001"');
  });

  it("lists task class, risk level, and risk factors as separate exact fields", () => {
    const section = tasksFieldValuesSection();

    expect(section).toContain(
      "- taskClass: localized_bug | bounded_feature | cross_file_change | regression_test | refactor | migration | security | documentation"
    );
    expect(section).toContain("- riskLevel: low | medium | high");
    expect(section).toContain(
      "- riskFactors[].code: authentication | authorization | cryptography | public_api | schema | dependency | concurrency | permissions | deployment | data_migration"
    );
    expect(section).toContain("- riskFactors[].version: 1.0");
    expect(section).toContain('"taskClass": "bounded_feature"');
    expect(section).toContain('"riskFactors": [');
  });
});
