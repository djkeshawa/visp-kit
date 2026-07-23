import { describe, expect, it } from "vitest";

import {
  taskGraphArtifactSchema,
  taskSchema
} from "../../../../src/artifacts/schemas/task.schema.js";
import { validTaskGraph } from "../fixtures.js";

describe("task schemas", () => {
  it("accepts valid tasks and task graphs", () => {
    expect(taskSchema.safeParse(validTaskGraph.tasks[0]).success).toBe(true);
    expect(taskGraphArtifactSchema.safeParse(validTaskGraph).success).toBe(true);
  });

  it("keeps legacy tasks valid when classification metadata is absent", () => {
    const result = taskSchema.safeParse(validTaskGraph.tasks[0]);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).not.toHaveProperty("taskClass");
    expect(result.data).not.toHaveProperty("riskFactors");
  });

  it("accepts explicit task class and versioned risk factors", () => {
    const result = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      taskClass: "bounded_feature",
      riskFactors: [
        { version: "1.0", code: "public_api" },
        { version: "1.0", code: "schema" }
      ]
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toMatchObject({
      riskLevel: "low",
      taskClass: "bounded_feature",
      riskFactors: [
        { version: "1.0", code: "public_api" },
        { version: "1.0", code: "schema" }
      ]
    });
  });

  it("keeps risk level independent from task class", () => {
    const localizedBug = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      riskLevel: "medium",
      taskClass: "localized_bug",
      riskFactors: []
    });
    const documentation = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      riskLevel: "medium",
      taskClass: "documentation",
      riskFactors: []
    });

    expect(localizedBug.success).toBe(true);
    expect(documentation.success).toBe(true);
    if (!localizedBug.success || !documentation.success) return;
    expect(localizedBug.data.riskLevel).toBe(documentation.data.riskLevel);
    expect(localizedBug.data.taskClass).toBe("localized_bug");
    expect(documentation.data.taskClass).toBe("documentation");
  });

  it.each([
    ["invalid task class", { taskClass: "bug", riskFactors: [] }],
    [
      "invalid risk factor version",
      {
        taskClass: "localized_bug",
        riskFactors: [{ version: "2.0", code: "concurrency" }]
      }
    ],
    [
      "invalid risk factor code",
      {
        taskClass: "localized_bug",
        riskFactors: [{ version: "1.0", code: "performance" }]
      }
    ],
    [
      "duplicate risk factors",
      {
        taskClass: "localized_bug",
        riskFactors: [
          { version: "1.0", code: "concurrency" },
          { version: "1.0", code: "concurrency" }
        ]
      }
    ]
  ])("rejects %s", (_label, classification) => {
    const result = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      ...classification
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid task statuses", () => {
    const result = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      status: "cancelled"
    });

    expect(result.success).toBe(false);
  });

  it("rejects invalid validation commands", () => {
    const result = taskSchema.safeParse({
      ...validTaskGraph.tasks[0],
      validationCommands: [""]
    });

    expect(result.success).toBe(false);
  });
});
