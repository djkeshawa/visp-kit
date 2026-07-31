import { describe, expect, it } from "vitest";

import { type SpecArtifact } from "../../../src/artifacts/schemas/spec.schema.js";
import {
  CRITIC_KNOWN_GAPS,
  blockingCriticFindings,
  criticiseSpecification
} from "../../../src/validators/specification-critic.js";

/**
 * P8-04. Every check has a positive and a negative fixture, because a check
 * that only ever fires proves nothing and a check that never fires is
 * decoration.
 *
 * The severity split is the load-bearing design decision: `false_block` is the
 * metric the evaluation protocol treats as deciding adoption, so a finding is
 * only blocking when reading two declared fields makes a false positive
 * impossible. Anything that judges prose stays advisory.
 */

const now = "2026-01-01T00:00:00.000Z";

function criterion(overrides: Partial<SpecArtifact["acceptanceCriteria"][number]> = {}) {
  return {
    id: "AC001",
    requirementId: "REQ001",
    description: "A valid email and password signs in.",
    testable: true,
    validationMethod: "integration" as const,
    ...overrides
  };
}

function requirement(overrides: Partial<SpecArtifact["requirements"][number]> = {}) {
  return {
    id: "REQ001",
    featureId: "001",
    title: "Sign in",
    description: "Users can sign in with an email address.",
    source: "user" as const,
    priority: "must" as const,
    acceptanceCriteria: [criterion()],
    assumptions: [],
    outOfScope: [],
    ...overrides
  };
}

function spec(overrides: Partial<SpecArtifact> = {}): SpecArtifact {
  return {
    featureId: "001",
    featureSlug: "sign-in",
    title: "Sign in",
    status: "ready",
    userStories: [],
    requirements: [requirement()],
    acceptanceCriteria: [criterion()],
    businessRules: [],
    nonFunctionalRequirements: {
      performance: [],
      security: [],
      accessibility: [],
      reliability: [],
      maintainability: []
    },
    edgeCases: [],
    assumptions: [],
    outOfScope: [],
    createdAt: now,
    updatedAt: now,
    ...overrides
  } as SpecArtifact;
}

const codes = (artifact: SpecArtifact) => criticiseSpecification(artifact).map((f) => f.code);

describe("P8-04 specification critic", () => {
  it("a well-formed specification produces no findings", () => {
    // The negative fixture for every check at once. If this ever fires, the
    // critic has started rejecting good work.
    expect(criticiseSpecification(spec())).toEqual([]);
    expect(blockingCriticFindings(spec())).toEqual([]);
  });

  describe("must-level requirement with nothing that can prove it", () => {
    it("flags a must requirement whose every criterion is untestable", () => {
      const artifact = spec({
        requirements: [requirement({ acceptanceCriteria: [criterion({ testable: false })] })],
        acceptanceCriteria: [criterion({ testable: false })]
      });
      expect(codes(artifact)).toContain("must_requirement_not_testable");
      expect(blockingCriticFindings(artifact)[0]).toMatch(/Nothing can prove it/u);
    });

    it("does not flag it when one criterion is testable", () => {
      const artifact = spec({
        requirements: [
          requirement({
            acceptanceCriteria: [criterion({ id: "AC001", testable: false }), criterion({ id: "AC002", testable: true })]
          })
        ],
        acceptanceCriteria: [criterion({ id: "AC001", testable: false }), criterion({ id: "AC002", testable: true })]
      });
      expect(codes(artifact)).not.toContain("must_requirement_not_testable");
    });

    it("does not flag a should-level requirement", () => {
      // Priority is the author's call. The critic objects to a MUST that cannot
      // be proven, not to every soft goal.
      const artifact = spec({
        requirements: [
          requirement({ priority: "should", acceptanceCriteria: [criterion({ testable: false })] })
        ],
        acceptanceCriteria: [criterion({ testable: false })]
      });
      expect(codes(artifact)).not.toContain("must_requirement_not_testable");
    });
  });

  describe("a non-goal that contradicts a requirement", () => {
    it("flags an out-of-scope entry matching a requirement title", () => {
      const artifact = spec({ outOfScope: ["Sign in"] });
      expect(codes(artifact)).toContain("non_goal_contradicts_requirement");
    });

    it("matches despite spacing and capitalisation", () => {
      const artifact = spec({ outOfScope: ["  SIGN   IN  "] });
      expect(codes(artifact)).toContain("non_goal_contradicts_requirement");
    });

    it("flags an out-of-scope entry naming a requirement id", () => {
      const artifact = spec({ outOfScope: ["REQ001 is deferred to a later release"] });
      expect(codes(artifact)).toContain("non_goal_contradicts_requirement");
    });

    it("does not flag an unrelated exclusion", () => {
      const artifact = spec({ outOfScope: ["Social login", "Password rotation policy"] });
      expect(codes(artifact)).not.toContain("non_goal_contradicts_requirement");
    });
  });

  describe("two constraints that cannot both hold", () => {
    it("flags the same statement declared a rule and out of scope", () => {
      const artifact = spec({
        businessRules: ["Sessions expire after 30 minutes"],
        outOfScope: ["sessions expire after 30 minutes"]
      });
      expect(codes(artifact)).toContain("constraint_contradicts_non_goal");
    });

    it("does not flag rules and exclusions that merely share words", () => {
      const artifact = spec({
        businessRules: ["Sessions expire after 30 minutes"],
        outOfScope: ["Session replay recording"]
      });
      expect(codes(artifact)).not.toContain("constraint_contradicts_non_goal");
    });
  });

  describe("a criterion bound to a requirement that does not exist", () => {
    it("flags the dangling criterion", () => {
      const artifact = spec({ acceptanceCriteria: [criterion({ requirementId: "REQ999" })] });
      expect(codes(artifact)).toContain("criterion_without_requirement");
    });

    it("does not flag a correctly bound criterion", () => {
      expect(codes(spec())).not.toContain("criterion_without_requirement");
    });
  });

  describe("a criterion that names nothing observable", () => {
    it("is advisory, never blocking", () => {
      // The severity split is the point. This check judges prose, so it must not
      // be able to reject a specification on its own.
      const artifact = spec({
        acceptanceCriteria: [criterion({ description: "Works correctly." })]
      });
      const findings = criticiseSpecification(artifact);
      const finding = findings.find((f) => f.code === "criterion_not_observable");
      expect(finding?.severity).toBe("advisory");
      expect(blockingCriticFindings(artifact)).toEqual([]);
    });

    it("leaves a vague word used inside a real condition alone", () => {
      // The match is whole-description on purpose: "works correctly when the
      // token has expired" names an observable condition and must survive.
      const artifact = spec({
        acceptanceCriteria: [criterion({ description: "Works correctly when the token has expired." })]
      });
      expect(codes(artifact)).not.toContain("criterion_not_observable");
    });

    it("does not fire on an untestable criterion", () => {
      const artifact = spec({
        acceptanceCriteria: [criterion({ description: "Works", testable: false })]
      });
      expect(codes(artifact)).not.toContain("criterion_not_observable");
    });
  });

  it("blocking findings sort before advisory ones", () => {
    const artifact = spec({
      outOfScope: ["Sign in"],
      acceptanceCriteria: [criterion({ description: "Works correctly." })]
    });
    const severities = criticiseSpecification(artifact).map((f) => f.severity);
    expect(severities.indexOf("blocking")).toBeLessThan(severities.indexOf("advisory"));
  });

  it("is deterministic — the same specification yields the same findings", () => {
    const artifact = spec({ outOfScope: ["Sign in"], businessRules: ["x"] });
    expect(criticiseSpecification(artifact)).toEqual(criticiseSpecification(artifact));
  });

  it("states the gaps it cannot reach", () => {
    // Recorded rather than disguised: a clean run does not mean a good spec.
    expect(CRITIC_KNOWN_GAPS).toContain("semantic_ambiguity_requires_a_model");
    expect(CRITIC_KNOWN_GAPS).toContain("missing_requirements_are_invisible");
    expect(CRITIC_KNOWN_GAPS).toContain("assumption_validation_deadline_has_no_schema_field");
  });
});
