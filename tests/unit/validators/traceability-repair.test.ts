import { describe, expect, it } from "vitest";

import { traceabilityMatrixSchema } from "../../../src/artifacts/schemas/traceability.schema.js";
import { untracedTaskErrors } from "../../../src/validators/traceability-repair.js";

const now = "2026-01-01T00:00:00.000Z";

const spec = {
  featureId: "001",
  status: "ready" as const,
  requirements: [
    {
      id: "REQ001",
      title: "Sign in",
      description: "Users sign in.",
      acceptanceCriteria: ["AC001"]
    },
    {
      id: "REQ002",
      title: "Sign out",
      description: "Users sign out.",
      acceptanceCriteria: ["AC002"]
    }
  ],
  acceptanceCriteria: [
    { id: "AC001", requirementId: "REQ001", description: "A valid email signs in." },
    { id: "AC002", requirementId: "REQ002", description: "Signing out clears the session." }
  ],
  businessRules: [],
  edgeCases: [],
  outOfScope: [],
  updatedAt: now
};

function matrix(entries: readonly Record<string, unknown>[]) {
  return { featureId: "001", entries, updatedAt: now } as never;
}

const req001Entry = {
  requirementId: "REQ001",
  acceptanceCriterionIds: ["AC001"],
  taskIds: [],
  filePaths: [],
  testPaths: [],
  status: "missing" as const
};

const t001 = { id: "T001", requirementIds: ["REQ001"], acceptanceCriterionIds: ["AC001"] };
const t002 = { id: "T002", requirementIds: ["REQ002"], acceptanceCriterionIds: ["AC002"] };

/** Pulls the JSON block out of an error so it can be parsed and checked. */
function jsonBlockFrom(message: string): unknown {
  const start = message.indexOf("[");

  expect(start).toBeGreaterThan(-1);

  return JSON.parse(message.slice(start));
}

describe("untracedTaskErrors", () => {
  it("tells the reader to extend the entry when the requirement already has one", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t001],
      traceability: matrix([req001Entry]),
      spec: spec as never
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("traceability.json does not list T001");
    expect(errors[0]).toContain("REQ001: add T001 to its taskIds");
    // The other repair would send the reader to author a duplicate entry for a
    // requirement that already has one.
    expect(errors[0]).not.toContain('Append to "entries"');
  });

  it("hands over the entry to append when the requirement has none", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t002],
      traceability: matrix([req001Entry]),
      spec: spec as never
    });

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("has no entry for REQ002");
    // "add to the taskIds of REQ002" is unsatisfiable here: there is no REQ002
    // entry and therefore no taskIds array to add to.
    expect(errors[0]).not.toContain("add T002 to its taskIds");
    expect(errors[0]).toContain('Append to "entries" in traceability.json');
  });

  it("separates the two repairs when one run needs both", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t001, t002],
      traceability: matrix([req001Entry]),
      spec: spec as never
    });

    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain("REQ001: add T001 to its taskIds");
    expect(errors[0]).not.toContain("T002");
    expect(errors[1]).toContain("has no entry for REQ002");
    expect(errors[1]).not.toContain("T001");
  });

  it("prints an entry that satisfies the check that printed it", () => {
    const traceability = matrix([req001Entry]);
    const errors = untracedTaskErrors({
      untracedTasks: [t002],
      traceability,
      spec: spec as never
    });
    const additions = jsonBlockFrom(errors[0]!) as unknown[];
    const repaired = {
      featureId: "001",
      entries: [req001Entry, ...(additions as never[])],
      updatedAt: now
    };

    // Pasting the fragment must validate and must actually trace the task the
    // error was about, or the message has replaced one guessing loop with
    // another. That the error then disappears is asserted through the real
    // validator in traceability-guidance.test.ts.
    expect(traceabilityMatrixSchema.safeParse(repaired).success).toBe(true);
    expect(repaired.entries.flatMap((entry) => entry.taskIds)).toContain("T002");
  });

  it("pairs the appended entry with its own acceptance criteria and task", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t002],
      traceability: matrix([req001Entry]),
      spec: spec as never
    });
    const additions = jsonBlockFrom(errors[0]!) as Array<{
      requirementId: string;
      acceptanceCriterionIds: string[];
      taskIds: string[];
      status: string;
    }>;

    expect(additions).toHaveLength(1);
    expect(additions[0]!.requirementId).toBe("REQ002");
    // Not AC001 — suggesting it would retrace a requirement already covered.
    expect(additions[0]!.acceptanceCriterionIds).toEqual(["AC002"]);
    expect(additions[0]!.taskIds).toEqual(["T002"]);
    // The entry arrives with tasks linked and files and tests still empty.
    expect(additions[0]!.status).toBe("partial");
  });

  it("falls back to the task's own criteria when no spec is available", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t002],
      traceability: matrix([req001Entry])
    });
    const additions = jsonBlockFrom(errors[0]!) as Array<{ acceptanceCriterionIds: string[] }>;

    expect(additions[0]!.acceptanceCriterionIds).toEqual(["AC002"]);
  });

  it("says nothing about a task that names no requirement", () => {
    // There is no entry to point at, and the caller reports the missing
    // requirement mapping as its own error.
    expect(
      untracedTaskErrors({
        untracedTasks: [{ id: "T003", requirementIds: [], acceptanceCriterionIds: [] }],
        traceability: matrix([req001Entry]),
        spec: spec as never
      })
    ).toEqual([]);
  });

  it("groups tasks that need the same new entry into one addition", () => {
    const errors = untracedTaskErrors({
      untracedTasks: [t002, { ...t002, id: "T004" }],
      traceability: matrix([req001Entry]),
      spec: spec as never
    });
    const additions = jsonBlockFrom(errors[0]!) as Array<{ taskIds: string[] }>;

    expect(additions).toHaveLength(1);
    expect(additions[0]!.taskIds).toEqual(["T002", "T004"]);
  });
});
