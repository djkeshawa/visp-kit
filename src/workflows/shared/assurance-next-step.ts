import {
  baselineEvidenceArtifactPath,
  candidateEvidenceArtifactPath,
  oracleApprovalArtifactPath,
  oracleLockArtifactPath,
  oraclePlanArtifactPath
} from "../../artifacts/artifact-paths.js";
import { readArtifact } from "../../artifacts/artifact-reader.js";
import { candidateEvidenceSchema } from "../../artifacts/schemas/candidate-evidence.schema.js";
import { oraclePlanSchema } from "../../artifacts/schemas/oracle-plan.schema.js";
import { type PolicyArtifact } from "../../artifacts/schemas/policy.schema.js";
import { type Task } from "../../artifacts/schemas/task.schema.js";
import { type CommandRunner } from "../../core/command-runner.js";
import { type VispError } from "../../core/errors.js";
import { pathExists } from "../../core/file-system.js";
import { ok, type Result } from "../../core/result.js";
import { createCandidateWorkspaceFingerprint } from "../../evidence/candidate-workspace.js";
import {
  assuranceActive,
  type AssuranceNextStep,
  type AssurancePhase
} from "../../oracle/assurance-activation.js";
import { loadOracleAuthorization } from "../oracle-authorization.workflow.js";

export type { AssuranceNextStep, AssurancePhase };

/** Nothing is owed: either the system is off, or it could not be inspected. */
export const inactiveAssuranceStep: AssuranceNextStep = {
  active: false,
  phase: "inactive",
  reason: "Assurance evidence is not required for this task."
};

/**
 * A recommendation is only useful if it is runnable, so when the authorization
 * loader refuses we prefer the command it names over a guess. Its errors carry
 * the repair verbatim ("Run `visp-kit verify --baseline --task T001`.").
 */
function commandFromError(message: string, fallback: string): string {
  return /`(visp(?:-kit)? [^`]+)`/u.exec(message)?.[1] ?? fallback;
}

/**
 * The next assurance command for a task, decided from artifacts on disk.
 *
 * Kit has shipped the whole oracle sequence since it was written, and `next` —
 * the command an agent loop calls every turn — has never mentioned any of it.
 * A user reached it by reading source. This makes the sequence reachable by
 * following the workflow.
 */
export async function resolveAssuranceNextStep(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly task: Task;
  readonly policy: PolicyArtifact;
  readonly implementationStarted: boolean;
  readonly now: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<AssuranceNextStep, VispError>> {
  const taskId = input.task.id;
  const planPath = oraclePlanArtifactPath(input.targetPath, input.featureKey, taskId);
  const planExists = await pathExists(planPath);
  if (!planExists.ok) return planExists;

  if (!assuranceActive({ policy: input.policy, oraclePlanExists: planExists.value })) {
    return ok(inactiveAssuranceStep);
  }

  if (!planExists.value) {
    return ok({
      active: true,
      phase: "plan",
      nextCommand: `visp-kit oracle plan --task ${taskId}`,
      reason: `Assurance is active for ${taskId} and no oracle plan exists yet.`
    });
  }

  const plan = await readArtifact(planPath, oraclePlanSchema, { artifactName: "oracle plan" });
  if (!plan.ok) {
    return ok({
      active: true,
      phase: "plan",
      nextCommand: `visp-kit oracle plan --task ${taskId} --force`,
      reason: `The oracle plan for ${taskId} could not be read: ${plan.error.message}`
    });
  }

  if (plan.value.assuranceProfile === "critical") {
    const approvalExists = await pathExists(
      oracleApprovalArtifactPath(input.targetPath, input.featureKey, taskId)
    );
    if (!approvalExists.ok) return approvalExists;
    if (!approvalExists.value) {
      return ok({
        active: true,
        phase: "approve",
        nextCommand: `visp-kit oracle approve --task ${taskId} --reviewer <id> --reason <reason>`,
        reason: `${taskId} is a critical task, so its oracle plan needs a named human approver.`
      });
    }
  }

  const lockExists = await pathExists(
    oracleLockArtifactPath(input.targetPath, input.featureKey, taskId)
  );
  if (!lockExists.ok) return lockExists;
  if (!lockExists.value) {
    return ok({
      active: true,
      phase: "lock",
      nextCommand: `visp-kit oracle lock --task ${taskId}`,
      reason: `The oracle plan for ${taskId} exists but is not locked.`
    });
  }

  const baselineExists = await pathExists(
    baselineEvidenceArtifactPath(input.targetPath, input.featureKey, taskId)
  );
  if (!baselineExists.ok) return baselineExists;
  if (!baselineExists.value) {
    return ok({
      active: true,
      phase: "baseline",
      nextCommand: `visp-kit verify --baseline --task ${taskId}`,
      reason: `${taskId} has no baseline evidence, so there is nothing to compare the implementation against.`
    });
  }

  const authorization = await loadOracleAuthorization({
    targetPath: input.targetPath,
    taskId: taskId,
    now: input.now
  });

  if (!authorization.ok) {
    return ok({
      active: true,
      phase: "baseline",
      nextCommand: commandFromError(
        authorization.error.message,
        `visp-kit verify --baseline --task ${taskId}`
      ),
      reason: `Assurance evidence for ${taskId} is not current: ${authorization.error.message}`
    });
  }

  if (!input.implementationStarted) {
    return ok({
      active: true,
      phase: "authorized",
      reason: `Assurance evidence for ${taskId} is current; implementation is authorized.`
    });
  }

  // Candidate evidence runs the locked command set again and compares it with
  // the baseline, so it must precede ordinary verification — the same ordering
  // `done` already enforces.
  const candidate = await currentCandidateEvidence({
    targetPath: input.targetPath,
    featureKey: input.featureKey,
    task: input.task,
    lockHash: authorization.value.lock.lockHash,
    commandRunner: input.commandRunner
  });
  if (!candidate.ok) return candidate;

  if (candidate.value.current) {
    return ok({
      active: true,
      phase: "authorized",
      reason: `Candidate evidence for ${taskId} passed against its locked baseline.`
    });
  }

  return ok({
    active: true,
    phase: "candidate",
    nextCommand: `visp-kit verify --candidate --task ${taskId}`,
    reason: `${taskId} ${candidate.value.reason}`
  });
}

/**
 * Whether candidate evidence on disk still speaks for the current workspace.
 *
 * Four ways it can stop doing so: it is absent, unreadable, bound to a
 * superseded oracle lock, or fingerprinted against a workspace that has since
 * changed. The workspace fingerprint is the one that matters in a loop — an
 * agent that edits one more file after a passing candidate run has evidence
 * that no longer describes what it wrote, and `next` should say so rather than
 * wave the task through to review.
 */
async function currentCandidateEvidence(input: {
  readonly targetPath: string;
  readonly featureKey: string;
  readonly task: Task;
  readonly lockHash: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<{ readonly current: boolean; readonly reason: string }, VispError>> {
  const evidencePath = candidateEvidenceArtifactPath(
    input.targetPath,
    input.featureKey,
    input.task.id
  );
  const exists = await pathExists(evidencePath);
  if (!exists.ok) return exists;
  if (!exists.value) {
    return ok({
      current: false,
      reason: "has source changes but no candidate evidence compared against its locked baseline."
    });
  }

  const evidence = await readArtifact(evidencePath, candidateEvidenceSchema, {
    artifactName: "candidate evidence"
  });
  if (!evidence.ok) {
    return ok({ current: false, reason: "has candidate evidence that could not be read." });
  }
  if (evidence.value.oracleAuthorization.lockHash !== input.lockHash) {
    return ok({
      current: false,
      reason: "has candidate evidence bound to a superseded oracle lock."
    });
  }
  if (evidence.value.outcome !== "passed") {
    return ok({
      current: false,
      reason: `has candidate evidence recorded as ${evidence.value.outcome}.`
    });
  }

  const workspace = await createCandidateWorkspaceFingerprint({
    targetPath: input.targetPath,
    task: input.task,
    commandRunner: input.commandRunner
  });
  if (!workspace.ok) return workspace;
  if (workspace.value.hash !== evidence.value.workspace.hash) {
    return ok({
      current: false,
      reason: "changed after its candidate evidence was recorded."
    });
  }

  return ok({ current: true, reason: "has current, passing candidate evidence." });
}
