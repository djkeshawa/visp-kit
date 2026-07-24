import {
  type CandidateEvidence,
  type CandidateWorkspace
} from "../artifacts/schemas/candidate-evidence.schema.js";
import { type OracleAuthorizationBinding } from "../artifacts/schemas/oracle-authorization.schema.js";
import {
  type OracleArtifactBinding,
  type OraclePlan
} from "../artifacts/schemas/oracle-plan.schema.js";
import { VispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";
import { providerRunsMatchRequirements, providerRunsPass } from "./provider-registry.js";

export function candidateEvidenceHash(
  evidence: Omit<CandidateEvidence, "evidenceHash">
): `sha256:${string}` {
  return hashOracleValue(evidence);
}

export function validateCandidateEvidenceIntegrity(input: {
  readonly evidence: CandidateEvidence;
  readonly plan: OraclePlan;
  readonly planPath: string;
  readonly authorization: OracleAuthorizationBinding;
  readonly baselineBinding: OracleArtifactBinding;
  readonly baselineCacheKeySha256: string;
  readonly currentWorkspace: CandidateWorkspace;
}): Result<CandidateEvidence, VispError> {
  const { evidenceHash, ...material } = input.evidence;
  if (candidateEvidenceHash(material) !== evidenceHash) {
    return err(new VispError("VALIDATION_FAILED", "Candidate evidence content hash is invalid."));
  }
  if (
    input.evidence.taskId !== input.plan.taskId ||
    input.evidence.featureId !== input.plan.featureId ||
    input.evidence.featureSlug !== input.plan.featureSlug ||
    input.evidence.oraclePlan.path !== input.planPath ||
    input.evidence.oraclePlan.sha256 !== hashOracleValue(input.plan)
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Candidate evidence is not bound to the current task plan."
      )
    );
  }
  const { hash: workspaceHash, ...workspaceMaterial } = input.evidence.workspace;
  const { hash: currentWorkspaceHash, ...currentWorkspaceMaterial } = input.currentWorkspace;
  if (
    hashOracleValue(workspaceMaterial) !== workspaceHash ||
    hashOracleValue(currentWorkspaceMaterial) !== currentWorkspaceHash ||
    workspaceHash !== currentWorkspaceHash
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Candidate evidence is stale for the current implementation workspace."
      )
    );
  }
  if (
    hashOracleValue(input.evidence.oracleAuthorization) !== hashOracleValue(input.authorization) ||
    hashOracleValue(input.evidence.baselineEvidence) !== hashOracleValue(input.baselineBinding) ||
    input.evidence.baselineCacheKeySha256 !== input.baselineCacheKeySha256
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Candidate evidence is not bound to the current authorization and baseline."
      )
    );
  }
  if (!providerRunsMatchRequirements(input.evidence.providerRuns, input.plan.requiredProviders)) {
    return err(
      new VispError("VALIDATION_FAILED", "Candidate evidence provider runs are incomplete.")
    );
  }
  if (
    input.evidence.outcome === "passed" &&
    (!providerRunsPass(input.evidence.providerRuns) ||
      input.evidence.testStrength.status !== "passed" ||
      input.evidence.oracles.some((oracle) => oracle.outcome !== "passed") ||
      input.evidence.commands.some(
        (command) => command.skipped || command.timedOut || command.exitCode === null
      ))
  ) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Candidate evidence claims passed without complete passing proof."
      )
    );
  }
  return ok(input.evidence);
}
