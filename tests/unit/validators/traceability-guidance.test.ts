import { describe, expect, it } from "vitest";

import { traceabilityMatrixSchema } from "../../../src/artifacts/schemas/traceability.schema.js";
import { validateSpec } from "../../../src/validators/validate-spec.js";
import { validateTaskGraph } from "../../../src/validators/validate-task-graph.js";

const now = "2026-01-01T00:00:00.000Z";

const spec = {
  featureId: "001",
  status: "ready" as const,
  requirements: [
    {
      id: "REQ001",
      title: "Sign in",
      description: "Users can sign in with an email address.",
      acceptanceCriteria: ["AC001"]
    },
    {
      id: "REQ002",
      title: "Sign out",
      description: "Users can sign out from any page.",
      acceptanceCriteria: ["AC002", "AC003"]
    }
  ],
  acceptanceCriteria: [
    { id: "AC001", requirementId: "REQ001", description: "A valid email and password signs in." },
    { id: "AC002", requirementId: "REQ002", description: "Signing out clears the session." },
    { id: "AC003", requirementId: "REQ002", description: "Signing out redirects to the home page." }
  ],
  businessRules: [],
  edgeCases: [],
  outOfScope: [],
  updatedAt: now
};

const tracedOnlyReq001 = {
  featureId: "001",
  entries: [
    {
      requirementId: "REQ001",
      acceptanceCriterionIds: ["AC001"],
      taskIds: ["T001"],
      filePaths: [],
      testPaths: [],
      status: "covered" as const
    }
  ],
  updatedAt: now
};

/** Pulls the JSON block out of an error so it can be parsed and checked. */
function jsonBlockFrom(message: string): unknown {
  const start = message.indexOf("[");

  expect(start).toBeGreaterThan(-1);

  return JSON.parse(message.slice(start));
}

describe("traceability repair guidance (F-D4)", () => {
  it("prints an entry that is valid against the traceability schema", () => {
    const result = validateSpec({ spec, traceability: tracedOnlyReq001 } as never);
    const message = result.errors.find((error) => error.includes("REQ002"));

    expect(message).toBeDefined();

    const additions = jsonBlockFrom(message!) as unknown[];

    // The whole value of printing an entry is that pasting it works. If the
    // suggestion did not satisfy the schema it would replace one guessing loop
    // with another.
    const repaired = {
      ...tracedOnlyReq001,
      entries: [...tracedOnlyReq001.entries, ...(additions as never[])]
    };

    expect(traceabilityMatrixSchema.safeParse(repaired).success).toBe(true);
  });

  it("pairs each missing requirement with its own acceptance criteria", () => {
    const result = validateSpec({ spec, traceability: tracedOnlyReq001 } as never);
    const message = result.errors.find((error) => error.includes("REQ002"))!;
    const additions = jsonBlockFrom(message) as Array<{
      requirementId: string;
      acceptanceCriterionIds: string[];
    }>;

    expect(additions).toHaveLength(1);
    expect(additions[0]!.requirementId).toBe("REQ002");
    // Not every criterion — only REQ002's. Suggesting AC001 here would
    // silently retrace a requirement that is already covered.
    expect(additions[0]!.acceptanceCriterionIds).toEqual(["AC002", "AC003"]);
  });

  it("reports a criterion missing from an already-traced requirement as an edit", () => {
    const partiallyTraced = {
      ...tracedOnlyReq001,
      entries: [
        tracedOnlyReq001.entries[0]!,
        {
          requirementId: "REQ002",
          acceptanceCriterionIds: ["AC002"],
          taskIds: ["T002"],
          filePaths: [],
          testPaths: [],
          status: "partial" as const
        }
      ]
    };
    const result = validateSpec({ spec, traceability: partiallyTraced } as never);
    const message = result.errors.join("\n");

    // AC003's requirement is traced, so the repair is to extend that entry,
    // not to add a new one. Conflating the two sends the reader to the wrong
    // edit.
    expect(message).toContain("AC003");
    expect(message).toContain("REQ002: add AC003 to its acceptanceCriterionIds");
  });

  it("names the requirement entry a missing task belongs to", () => {
    const taskGraph = {
      featureId: "001",
      status: "ready" as const,
      tasks: [
        {
          id: "T001",
          title: "Add the sign-in form",
          description: "Render and wire the sign-in form.",
          dependsOn: [],
          requirementIds: ["REQ001"],
          acceptanceCriterionIds: ["AC001"],
          validationCommands: ["npm test"],
          allowedFiles: ["src/sign-in.ts"],
          expectedFiles: ["src/sign-in.ts"],
          riskFactors: [],
          taskClass: "bounded_feature" as const
        },
        {
          id: "T002",
          title: "Add the sign-out control",
          description: "Render and wire the sign-out control.",
          dependsOn: ["T001"],
          requirementIds: ["REQ002"],
          acceptanceCriterionIds: ["AC002"],
          validationCommands: ["npm test"],
          allowedFiles: ["src/sign-out.ts"],
          expectedFiles: ["src/sign-out.ts"],
          riskFactors: [],
          taskClass: "bounded_feature" as const
        }
      ],
      updatedAt: now
    };
    const result = validateTaskGraph({
      taskGraph,
      spec,
      traceability: tracedOnlyReq001
    } as never);
    const message = result.errors.join("\n");

    // T002 already declares the requirement it implements, so the validator
    // can say exactly which entry to edit rather than leaving the reader to
    // correlate two files by hand.
    expect(message).toContain("T002: add to the taskIds of REQ002");
    expect(message).not.toContain("T001: add to the taskIds");
  });
});
