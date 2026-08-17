import { describe, expect, it } from "vitest";

import {
  contextCopyMismatch,
  differingFields,
  nestedCriterionMismatch
} from "../../../src/oracle/oracle-authority-errors.js";

const criterion = {
  id: "AC004",
  requirementId: "REQ002",
  description: "Pinned notes sort before unpinned ones.",
  testable: true,
  validationMethod: "unit"
};

describe("differingFields", () => {
  it("names the fields whose values disagree", () => {
    expect(differingFields(criterion, { ...criterion, description: "Something else." })).toEqual([
      "description"
    ]);
  });

  it("counts a field present on only one side as differing", () => {
    const { testable: _testable, ...withoutTestable } = criterion;

    expect(differingFields(criterion, withoutTestable)).toEqual(["testable"]);
  });

  it("finds nothing when the two copies agree", () => {
    expect(differingFields(criterion, { ...criterion })).toEqual([]);
  });
});

describe("nestedCriterionMismatch", () => {
  it("names the authoritative copy, the JSON path that disagrees, and the repair", () => {
    const message = nestedCriterionMismatch({
      requirementId: "REQ002",
      criterionId: "AC004",
      specPath: ".visp/features/001-demo/spec.json",
      authoritative: criterion,
      found: { ...criterion, description: "A paraphrase." }
    });

    expect(message).toContain("acceptanceCriteria[id=AC004] in .visp/features/001-demo/spec.json");
    expect(message).toContain(
      "requirements[id=REQ002].acceptanceCriteria[id=AC004] in .visp/features/001-demo/spec.json"
    );
    expect(message).toContain("It differs in: description.");
    expect(message).toContain("visp-kit spec --validate");
  });

  it("shows the fragment the copy must equal", () => {
    const message = nestedCriterionMismatch({
      requirementId: "REQ002",
      criterionId: "AC004",
      specPath: ".visp/features/001-demo/spec.json",
      authoritative: criterion,
      found: undefined
    });

    expect(message).toContain("It is absent.");
    expect(message).toContain(JSON.stringify(criterion, null, 2));
  });
});

describe("contextCopyMismatch", () => {
  it("sends the reader to --force, because a plain regenerate keeps the stale pack", () => {
    const message = contextCopyMismatch({
      kind: "criterion",
      entityId: "AC004",
      taskId: "T009",
      specPath: ".visp/features/001-demo/spec.json",
      contextPath: ".visp/features/001-demo/context/T009.context.json",
      authoritative: criterion,
      found: { ...criterion, description: "Stale." }
    });

    expect(message).toContain("includedAcceptanceCriteria[id=AC004]");
    expect(message).toContain("visp-kit context T009 --force");
    expect(message).toContain("Without --force the existing pack is kept");
  });

  it("names the requirement arrays when the requirement copy is the one that drifted", () => {
    const message = contextCopyMismatch({
      kind: "requirement",
      entityId: "REQ002",
      taskId: "T009",
      specPath: ".visp/features/001-demo/spec.json",
      contextPath: ".visp/features/001-demo/context/T009.context.json",
      authoritative: { id: "REQ002" },
      found: undefined
    });

    expect(message).toContain("includedRequirements[id=REQ002]");
    expect(message).toContain("requirements[id=REQ002] in .visp/features/001-demo/spec.json");
  });
});
