import { type NextStep } from "../orchestrator/next-step.js";
import { type ProjectState } from "../orchestrator/project-state.js";
import {
  canonicalJsonV1,
  createWorkflowActionId,
  createWorkflowActionIdV1_1,
  createWorkflowActionIdV1_2,
  createWorkflowActionIdV1_3,
  type Sha256Hash,
  sortedUnique
} from "./canonical-json.js";
import { selectCanonicalEvidence } from "./canonical-evidence.js";
import { workflowActionHashProjectionV1_3 } from "./hash-projection.js";

import {
  type CanonicalAssuranceSummary,
  type CanonicalWorkflowAction,
  type CanonicalWorkflowActionEnvelope,
  type CanonicalWorkflowActionEnvelopeV1_1,
  type CanonicalWorkflowActionEnvelopeV1_2,
  type CanonicalWorkflowActionEnvelopeV1_3,
  type CanonicalWorkflowActionIdentityInput,
  type CanonicalWorkflowActionV1_1IdentityInput,
  type CanonicalWorkflowActionV1_2IdentityInput,
  type CanonicalWorkflowActionV1_3IdentityInput,
  type Finding
} from "./canonical-workflow-action.types.js";

export * from "./canonical-workflow-action.types.js";
import {
  type AddFinding,
  available,
  normalizeProjectPath,
  normalizeRiskFactors,
  normalizedFindings,
  notApplicable,
  unavailable
} from "./canonical-workflow-action.findings.js";

export { canonicalFindingReference } from "./canonical-workflow-action.findings.js";
import {
  identityFindings,
  phaseFromState,
  projectStateFindings,
  sourceIdentityFindings,
  strictnessContext
} from "./canonical-workflow-action.identity.js";
import { collectRequiredReads, readCandidates } from "./canonical-workflow-action.reads.js";
import { actionScope, claimContext } from "./canonical-workflow-action.scope.js";
import { policyStatus, stepFindings, verdict } from "./canonical-workflow-action.verdict.js";

export async function buildCanonicalWorkflowActionEnvelope(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<CanonicalWorkflowActionEnvelope> {
  const pendingFindings: Finding[] = [];
  const v2ReadFindingOrder: Sha256Hash[] = [];
  const v2BlockerFindingOrder: Sha256Hash[] = [];
  let decisionContradiction = false;
  const addFinding: AddFinding = (finding, invalidatesDecision = false) => {
    pendingFindings.push(finding);
    if (invalidatesDecision) decisionContradiction = true;
  };

  const phase = phaseFromState(input.step.state);
  if (phase === "next") {
    addFinding(
      {
        code: "VISP.CONTRACT.WORKFLOW_STATE_UNKNOWN",
        source: "contract",
        severity: "error",
        effect: "uncertain",
        message: `Workflow state is not mapped by canonical version 1.0: ${JSON.stringify(input.step.state)}.`,
        recommendation: "Upgrade Kit or recompute the action from a recognized workflow state.",
        evidence: [input.step.state]
      },
      true
    );
  }
  projectStateFindings(input.state, input.step.nextCommand, addFinding);
  identityFindings(input.state, input.step, addFinding);
  sourceIdentityFindings(input.state, addFinding);
  stepFindings(input.step, addFinding, v2BlockerFindingOrder);

  const featurePath =
    input.state.selectedFeature === undefined
      ? undefined
      : normalizeProjectPath(input.state.selectedFeature.relativePath, addFinding);
  const reads = await collectRequiredReads(
    input.state,
    readCandidates(input.state, featurePath),
    addFinding,
    v2ReadFindingOrder
  );
  const scopeSelection = actionScope({
    phase,
    featurePath,
    task: input.state.selectedTask,
    addFinding
  });
  const claimSelection = claimContext(input.state, addFinding);
  const strictness = strictnessContext(input.step.strictnessMode, addFinding);
  const goal =
    input.state.selectedTask?.description ??
    input.state.selectedFeature?.intent?.rawUserRequest ??
    input.step.reason;

  if (goal.trim().length === 0) {
    throw new TypeError("canonical-workflow-action: goal must be non-empty");
  }
  if (input.step.nextCommand.trim().length === 0) {
    throw new TypeError("canonical-workflow-action: nextCommand must be non-empty");
  }

  const task = input.state.selectedTask;
  const identityInput: CanonicalWorkflowActionIdentityInput = {
    canonicalVersion: "1.0",
    phase,
    feature:
      input.state.selectedFeature === undefined
        ? null
        : { id: input.state.selectedFeature.id, slug: input.state.selectedFeature.slug },
    task:
      task === undefined
        ? null
        : {
            id: task.id,
            title: task.title,
            status: task.status,
            dependsOn: sortedUnique(task.dependsOn),
            parallelizable: task.parallelizable
          },
    taskClass:
      task === undefined
        ? notApplicable("no_active_task")
        : task.taskClass === undefined
          ? unavailable("not_in_source_artifact")
          : available(task.taskClass),
    risk: {
      level: task === undefined ? notApplicable("no_active_task") : available(task.riskLevel),
      factors:
        task === undefined
          ? notApplicable("no_active_task")
          : task.riskFactors === undefined
            ? unavailable("not_in_source_artifact")
            : available(normalizeRiskFactors(task.riskFactors))
    },
    assurance: {
      level: strictness.level,
      profile:
        task === undefined
          ? notApplicable("no_active_task")
          : task.taskClass === undefined || task.riskFactors === undefined
            ? unavailable("not_in_source_artifact")
            : input.step.assuranceProfile === undefined
              ? unavailable("not_captured")
              : available(input.step.assuranceProfile),
      workflowStrictness: strictness.workflowStrictness
    },
    goal,
    // The task's base: HEAD when its context pack was generated. Every frame
    // said "not_captured" for the product's whole life, and the cost surfaced
    // in evaluation — nothing could judge committed work, so agents that
    // commit early (weak models always do) could never pass a checkpoint.
    baseCommit:
      input.state.contextPack?.baseCommit === undefined
        ? unavailable("not_captured")
        : available(input.state.contextPack.baseCommit),
    requiredReads: reads,
    scope: scopeSelection.scope,
    claims: claimSelection.claims,
    validationOracles: claimSelection.oracles,
    validationCommands: [
      ...(input.state.contextPack?.validationCommands ?? task?.validationCommands ?? [])
    ],
    requiredEvidence: unavailable("not_in_source_artifact"),
    policy: {
      status: policyStatus(input.state, addFinding),
      appliedOverrides: unavailable("not_captured")
    },
    findings: [],
    verdict: "ready",
    nextCommand: input.step.nextCommand
  };

  const finalFindings = normalizedFindings(pendingFindings);
  const finalIdentityInput: CanonicalWorkflowActionIdentityInput = {
    ...identityInput,
    findings: finalFindings,
    verdict: verdict(finalFindings, decisionContradiction)
  };
  const actionId = createWorkflowActionId(finalIdentityInput);
  const { canonicalVersion, ...actionBody } = finalIdentityInput;

  const action: CanonicalWorkflowAction = {
    canonicalVersion,
    actionId,
    ...actionBody
  };
  return {
    action,
    v2Presentation: {
      writablePaths: scopeSelection.presentation.writablePaths,
      forbiddenPaths: scopeSelection.presentation.forbiddenPaths,
      oracleOrder: claimSelection.oracleOrder,
      findingOrder: [...v2ReadFindingOrder, ...v2BlockerFindingOrder]
    }
  };
}

export async function buildCanonicalWorkflowAction(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<CanonicalWorkflowAction> {
  return (await buildCanonicalWorkflowActionEnvelope(input)).action;
}

export async function upgradeCanonicalWorkflowActionEnvelopeV1_1(input: {
  readonly state: ProjectState;
  readonly envelope: CanonicalWorkflowActionEnvelope;
}): Promise<CanonicalWorkflowActionEnvelopeV1_1> {
  const evidenceSelection = await selectCanonicalEvidence(input.state);
  const findings = normalizedFindings([
    ...input.envelope.action.findings,
    ...(evidenceSelection.finding === undefined ? [] : [evidenceSelection.finding])
  ]);
  const {
    actionId: _actionId,
    canonicalVersion: _canonicalVersion,
    ...base
  } = input.envelope.action;
  const identityInput: CanonicalWorkflowActionV1_1IdentityInput = {
    canonicalVersion: "1.1",
    ...base,
    requiredEvidence: base.requiredEvidence,
    evidence: evidenceSelection.evidence,
    findings,
    verdict: verdict(findings, false)
  };
  return {
    action: {
      canonicalVersion: "1.1",
      actionId: createWorkflowActionIdV1_1(identityInput),
      ...base,
      requiredEvidence: base.requiredEvidence,
      evidence: evidenceSelection.evidence,
      findings,
      verdict: verdict(findings, false)
    },
    v2Presentation: input.envelope.v2Presentation
  };
}

export function upgradeCanonicalWorkflowActionEnvelopeV1_2(input: {
  readonly envelope: CanonicalWorkflowActionEnvelopeV1_1;
  readonly assuranceSummary: CanonicalAssuranceSummary;
}): CanonicalWorkflowActionEnvelopeV1_2 {
  const {
    actionId: _actionId,
    canonicalVersion: _canonicalVersion,
    ...base
  } = input.envelope.action;
  const identityInput: CanonicalWorkflowActionV1_2IdentityInput = {
    canonicalVersion: "1.2",
    ...base,
    assuranceSummary: input.assuranceSummary
  };
  return {
    action: {
      canonicalVersion: "1.2",
      actionId: createWorkflowActionIdV1_2(identityInput),
      ...base,
      assuranceSummary: input.assuranceSummary
    },
    v2Presentation: input.envelope.v2Presentation
  };
}

export function upgradeCanonicalWorkflowActionEnvelopeV1_3(input: {
  readonly envelope: CanonicalWorkflowActionEnvelopeV1_2;
}): CanonicalWorkflowActionEnvelopeV1_3 {
  const {
    actionId: _actionId,
    canonicalVersion: _canonicalVersion,
    ...base
  } = input.envelope.action;
  const identityInput: CanonicalWorkflowActionV1_3IdentityInput = {
    canonicalVersion: "1.3",
    ...base
  };
  return {
    action: {
      canonicalVersion: "1.3",
      // Identity hashes the projection, not the full input: command wording
      // (`nextCommand`, finding messages/recommendations/evidence) is excluded
      // so a CLI rename can never move an action identity (D-119).
      actionId: createWorkflowActionIdV1_3(workflowActionHashProjectionV1_3(identityInput)),
      ...base
    },
    v2Presentation: input.envelope.v2Presentation
  };
}

export function canonicalWorkflowActionJson(action: CanonicalWorkflowAction): string {
  return canonicalJsonV1(action);
}
