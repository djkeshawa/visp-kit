import {
  baselineEvidenceArtifactPath,
  candidateEvidenceArtifactPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import {
  type BaselineEvidence,
  baselineEvidenceSchema
} from "../artifacts/schemas/baseline-evidence.schema.js";
import {
  type CandidateEvidence,
  candidateEvidenceSchema
} from "../artifacts/schemas/candidate-evidence.schema.js";
import { type EvidenceProviderRun } from "../artifacts/schemas/provider-run.schema.js";
import { pathExists, readTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { validateCandidateEvidenceIntegrity } from "../evidence/candidate-evidence-validator.js";
import { createCandidateWorkspaceFingerprint } from "../evidence/candidate-workspace.js";
import { hashOracleText } from "../oracle/oracle-authorization.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import { loadOracleAuthorization } from "../workflows/oracle-authorization.workflow.js";
import { compareUtf16CodeUnits } from "./canonical-json.js";
import {
  type CanonicalEvidenceSummary,
  type DeclaredValue,
  type Finding
} from "./canonical-workflow-action.js";

export type CanonicalEvidenceSelection = {
  readonly evidence: DeclaredValue<CanonicalEvidenceSummary>;
  readonly finding?: Finding;
};

function unavailable(
  reasonCode: "source_missing" | "source_invalid"
): DeclaredValue<CanonicalEvidenceSummary> {
  return { state: "unavailable", reasonCode };
}

function invalidEvidenceFinding(path: string, reason: string): Finding {
  return {
    code: "VISP.EVIDENCE.CURRENT_INVALID",
    source: "freshness",
    severity: "error",
    effect: "uncertain",
    message: `Current task evidence is invalid or stale: ${reason}`,
    recommendation: "Regenerate the exact task evidence before relying on this action.",
    evidence: [path]
  };
}

function summarizeProviders(
  runs: readonly EvidenceProviderRun[]
): CanonicalEvidenceSummary["providers"] {
  return [...runs]
    .sort((left, right) => compareUtf16CodeUnits(left.id, right.id))
    .map((run) => ({
      id: run.id,
      provider: { ...run.provider },
      status: run.status,
      failure: run.failure === null ? null : { ...run.failure },
      results: [...run.results]
        .sort((left, right) => compareUtf16CodeUnits(left.id, right.id))
        .map((result) => ({
          id: result.id,
          requirementId: result.requirementId,
          target: structuredClone(result.target),
          freshness: {
            ...result.freshness,
            inputHashes: [...result.freshness.inputHashes]
              .map((input) => ({ ...input }))
              .sort((left, right) => {
                const byId = compareUtf16CodeUnits(left.id, right.id);
                return byId !== 0 ? byId : compareUtf16CodeUnits(left.sha256, right.sha256);
              })
          },
          independence: result.independence,
          outcome: structuredClone(result.outcome)
        }))
    }));
}

function overallFreshness(
  providers: CanonicalEvidenceSummary["providers"]
): CanonicalEvidenceSummary["freshness"] {
  const results = providers.flatMap((provider) => provider.results);
  if (results.some((result) => result.freshness.status === "stale")) return "stale";
  if (
    results.length === 0 ||
    providers.some((provider) => provider.status === "inconclusive") ||
    results.some((result) => result.freshness.status === "unknown")
  ) {
    return "unknown";
  }
  return "fresh";
}

function summary(input: {
  readonly evidence: BaselineEvidence | CandidateEvidence;
  readonly source: "baseline" | "candidate";
  readonly artifactPath: string;
  readonly artifactSha256: `sha256:${string}`;
}): CanonicalEvidenceSummary {
  const providers = summarizeProviders(input.evidence.providerRuns);
  return {
    version: "1.0",
    source: input.source,
    artifact: {
      path: input.artifactPath,
      contentHash: input.artifactSha256
    },
    generatedAt: input.evidence.generatedAt,
    outcome: input.evidence.outcome,
    freshness: overallFreshness(providers),
    providers,
    testStrength:
      input.source === "candidate"
        ? {
            state: "available",
            value: {
              ...(input.evidence as CandidateEvidence).testStrength,
              independence: [...(input.evidence as CandidateEvidence).testStrength.independence]
            }
          }
        : { state: "not_applicable", reasonCode: "stage_does_not_require_value" }
  };
}

async function existing(path: string): Promise<boolean | undefined> {
  const result = await pathExists(path);
  return result.ok ? result.value : undefined;
}

export async function selectCanonicalEvidence(
  state: ProjectState
): Promise<CanonicalEvidenceSelection> {
  const task = state.selectedTask;
  const feature = state.selectedFeature;
  if (task === undefined) {
    return {
      evidence: { state: "not_applicable", reasonCode: "no_active_task" }
    };
  }
  if (feature === undefined) {
    return {
      evidence: unavailable("source_invalid"),
      finding: invalidEvidenceFinding(".visp/features", "the active feature is unavailable")
    };
  }

  const candidatePath = candidateEvidenceArtifactPath(state.targetPath, feature.key, task.id);
  const baselinePath = baselineEvidenceArtifactPath(state.targetPath, feature.key, task.id);
  const candidateExists = await existing(candidatePath);
  const baselineExists = await existing(baselinePath);
  if (candidateExists === undefined || baselineExists === undefined) {
    return {
      evidence: unavailable("source_invalid"),
      finding: invalidEvidenceFinding(
        relativePath(state.targetPath, candidatePath),
        "the evidence filesystem state could not be inspected"
      )
    };
  }
  if (!candidateExists && !baselineExists) {
    return { evidence: unavailable("source_missing") };
  }

  const authorization = await loadOracleAuthorization({
    targetPath: state.targetPath,
    feature: feature.key,
    taskId: task.id
  });
  const selectedPath = candidateExists ? candidatePath : baselinePath;
  const selectedRelativePath = relativePath(state.targetPath, selectedPath);
  if (!authorization.ok || authorization.value.baselineEvidence === undefined) {
    return {
      evidence: unavailable("source_invalid"),
      finding: invalidEvidenceFinding(
        selectedRelativePath,
        authorization.ok ? "the locked baseline is unavailable" : authorization.error.message
      )
    };
  }

  if (candidateExists) {
    const [candidate, raw] = await Promise.all([
      readArtifact(candidatePath, candidateEvidenceSchema, {
        artifactName: "candidate evidence"
      }),
      readTextFile(candidatePath)
    ]);
    if (!candidate.ok) {
      return {
        evidence: unavailable("source_invalid"),
        finding: invalidEvidenceFinding(selectedRelativePath, candidate.error.message)
      };
    }
    if (!raw.ok) {
      return {
        evidence: unavailable("source_invalid"),
        finding: invalidEvidenceFinding(selectedRelativePath, raw.error.message)
      };
    }
    const baselineBinding = authorization.value.lock.baselineEvidence;
    if (baselineBinding === undefined) {
      return {
        evidence: unavailable("source_invalid"),
        finding: invalidEvidenceFinding(selectedRelativePath, "the baseline binding is missing")
      };
    }
    const workspace = await createCandidateWorkspaceFingerprint({
      targetPath: state.targetPath,
      task
    });
    if (!workspace.ok) {
      return {
        evidence: unavailable("source_invalid"),
        finding: invalidEvidenceFinding(selectedRelativePath, workspace.error.message)
      };
    }
    const validated = validateCandidateEvidenceIntegrity({
      currentWorkspace: workspace.value,
      evidence: candidate.value,
      plan: authorization.value.plan,
      planPath: authorization.value.planPath,
      authorization: authorization.value.binding,
      baselineBinding,
      baselineCacheKeySha256: authorization.value.baselineEvidence.cacheKey.hash
    });
    if (!validated.ok) {
      return {
        evidence: unavailable("source_invalid"),
        finding: invalidEvidenceFinding(selectedRelativePath, validated.error.message)
      };
    }
    return {
      evidence: {
        state: "available",
        value: summary({
          evidence: validated.value,
          source: "candidate",
          artifactPath: selectedRelativePath,
          artifactSha256: hashOracleText(raw.value)
        })
      }
    };
  }

  const raw = await readTextFile(baselinePath);
  const baseline = await readArtifact(baselinePath, baselineEvidenceSchema, {
    artifactName: "baseline evidence"
  });
  if (!raw.ok) {
    return {
      evidence: unavailable("source_invalid"),
      finding: invalidEvidenceFinding(selectedRelativePath, raw.error.message)
    };
  }
  if (!baseline.ok) {
    return {
      evidence: unavailable("source_invalid"),
      finding: invalidEvidenceFinding(selectedRelativePath, baseline.error.message)
    };
  }
  return {
    evidence: {
      state: "available",
      value: summary({
        evidence: baseline.value,
        source: "baseline",
        artifactPath: selectedRelativePath,
        artifactSha256: hashOracleText(raw.value)
      })
    }
  };
}
