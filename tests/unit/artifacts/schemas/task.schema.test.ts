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
