import { describe, expect, it } from "vitest";

import { type CandidateEvidence } from "../../../src/artifacts/schemas/candidate-evidence.schema.js";
import { type OraclePlan } from "../../../src/artifacts/schemas/oracle-plan.schema.js";
import {
  candidateEvidenceHash,
  validateCandidateEvidenceIntegrity
} from "../../../src/evidence/candidate-evidence-validator.js";
import { hashOracleValue } from "../../../src/oracle/oracle-authorization.js";

const digest = `sha256:${"a".repeat(64)}` as const;
const planPath = ".visp/features/001-example/assurance/T001/oracle-plan.json";
const baselineBinding = {
  path: ".visp/features/001-example/assurance/T001/baseline-evidence.json",
  sha256: digest
};
const authorization = {
  lockPath: ".visp/features/001-example/assurance/T001/oracle-lock.json",
  lockHash: digest,
  lockFileSha256: digest
};
const workspaceMaterial = {
  version: "1.0" as const,
  mode: "task_scope_fallback" as const,
  files: [
    {
      path: "src/example.ts",
      state: "present" as const,
      sha256: digest,
      executable: false
    }
  ]
};
const workspace = { ...workspaceMaterial, hash: hashOracleValue(workspaceMaterial) };

function plan(): OraclePlan {
  const binding = { path: ".visp/input.json", sha256: digest };
  return {
    version: "1.0",
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    assuranceProfile: "behavioral",
    criticalReviewApproval: { required: false, status: "not_required" },
    oracles: [
      {
        id: "ORACLE-AC001",
        requirementId: "REQ001",
        acceptanceCriterionId: "AC001",
        description: "Observable.",
        priority: "must",
        validationMethod: "unit",
        baseline: { expected: "recorded" },
        candidate: { expected: "passed" }
      }
    ],
    validationCommands: ["pnpm test"],
    testStrengthEvidence: [],
    bindings: {
      policy: binding,
      specification: binding,
      plan: binding,
      taskGraph: binding,
      context: binding,
      task: { id: "T001", sha256: digest }
    },
    baseCommit: { status: "unavailable", reason: "Fixture." },
    requiredProviders: [{ id: "command", version: "1.0" }],
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
}

function evidence(): CandidateEvidence {
  const oraclePlan = plan();
  const material: Omit<CandidateEvidence, "evidenceHash"> = {
    version: "1.0",
    id: "CANDIDATE-001-T001",
    featureId: "001",
    featureSlug: "example",
    taskId: "T001",
    oraclePlan: { path: planPath, sha256: hashOracleValue(oraclePlan) },
    oracleAuthorization: authorization,
    baselineEvidence: baselineBinding,
    baselineCacheKeySha256: digest,
    workspace,
    testStrength: {
      status: "inconclusive",
      independence: [],
      reason: "No independent evidence."
    },
    oracles: [
      {
        oracleId: "ORACLE-AC001",
        baseline: {
          expected: "recorded",
          observed: "passed",
          expectationMet: true
        },
        candidate: {
          expected: "passed",
          observed: "inconclusive",
          expectationMet: false
        },
        outcome: "inconclusive"
      }
    ],
    providerRuns: [
      {
        version: "1.0",
        id: "PROVIDER-candidate-command",
        provider: { id: "command", version: "1.0" },
        phase: "candidate",
        status: "inconclusive",
        failure: { code: "malformed_output", reason: "Malformed." },
        results: []
      }
    ],
    commands: [],
    outcome: "inconclusive",
    generatedAt: "2026-07-25T00:00:00.000Z"
  };
  return { ...material, evidenceHash: candidateEvidenceHash(material) };
}

function validate(value: CandidateEvidence, cacheKey = digest) {
  return validateCandidateEvidenceIntegrity({
    evidence: value,
    plan: plan(),
    planPath,
    authorization,
    baselineBinding,
    baselineCacheKeySha256: cacheKey,
    currentWorkspace: workspace
  });
}

describe("candidate evidence integrity", () => {
  it("accepts an internally consistent fail-closed artifact", () => {
    expect(validate(evidence()).ok).toBe(true);
  });

  it("rejects content tampering and stale baseline cache binding", () => {
    const original = evidence();
    expect(validate({ ...original, outcome: "passed" }).ok).toBe(false);
    expect(validate(original, `sha256:${"b".repeat(64)}`).ok).toBe(false);
  });

  it("rejects a candidate after the implementation workspace changes", () => {
    const changedMaterial = {
      ...workspaceMaterial,
      files: [{ ...workspaceMaterial.files[0], sha256: `sha256:${"b".repeat(64)}` as const }]
    };
    const changedWorkspace = {
      ...changedMaterial,
      hash: hashOracleValue(changedMaterial)
    };
    const original = evidence();

    expect(
      validateCandidateEvidenceIntegrity({
        evidence: original,
        plan: plan(),
        planPath,
        authorization,
        baselineBinding,
        baselineCacheKeySha256: digest,
        currentWorkspace: changedWorkspace
      }).ok
    ).toBe(false);
  });

  it("rejects a recomputed pass without complete provider and strength proof", () => {
    const original = evidence();
    const { evidenceHash: _ignored, ...material } = { ...original, outcome: "passed" as const };
    const forged = { ...material, evidenceHash: candidateEvidenceHash(material) };

    expect(validate(forged).ok).toBe(false);
  });
});
