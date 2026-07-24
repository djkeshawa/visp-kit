import { type ProjectState } from "../orchestrator/project-state.js";
import { type NextStep } from "../orchestrator/next-step.js";
import {
  compareUtf16CodeUnits,
  createWorkflowActionId,
  createWorkflowActionIdV1_1
} from "./canonical-json.js";
import {
  buildCanonicalWorkflowActionEnvelope,
  canonicalFindingReference,
  upgradeCanonicalWorkflowActionEnvelopeV1_1,
  type CanonicalWorkflowAction,
  type CanonicalWorkflowActionEnvelope,
  type CanonicalWorkflowActionEnvelopeV1_1,
  type CanonicalWorkflowPhase,
  type Finding,
  type HashedReadRole
} from "./canonical-workflow-action.js";
import {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  type WorkflowAction,
  type WorkflowActionProtocol,
  type WorkflowActionV2,
  type WorkflowActionV3,
  type WorkflowActionV31,
  isWorkflowActionProtocol,
  workflowActionV2Schema,
  workflowActionV3Schema,
  workflowActionV31Schema
} from "./workflow-action-schema.js";

export {
  DEFAULT_WORKFLOW_ACTION_PROTOCOL,
  SUPPORTED_WORKFLOW_ACTION_PROTOCOLS,
  WORKFLOW_ACTION_SCHEMA_HASHES,
  type WorkflowAction,
  type WorkflowActionProtocol,
  type WorkflowActionV2,
  type WorkflowActionV3,
  type WorkflowActionV31,
  isWorkflowActionProtocol,
  workflowActionSchemaHash,
  workflowActionV2Schema,
  workflowActionV3Schema,
  workflowActionV31Schema
} from "./workflow-action-schema.js";

const v2Phase: Record<CanonicalWorkflowPhase, WorkflowActionV2["phase"]> = {
  next: "implement",
  setup: "implement",
  feature: "implement",
  clarify: "clarify",
  spec: "specify",
  plan: "plan",
  tasks: "task",
  context: "task",
  implement: "implement",
  verify: "verify",
  review: "verify",
  reconcile: "verify",
  pr: "implement"
};

const v2ReadRole: Record<HashedReadRole, string> = {
  policy: "policy",
  intent: "intent",
  specification: "specification",
  plan: "plan",
  task_graph: "task-graph",
  context_pack: "context-pack",
  implementation_prompt: "implementation-prompt",
  oracle_plan: "oracle-plan"
};

function normalizedPresentationPath(pathValue: string): string {
  const normalized = pathValue.replaceAll("\\", "/");
  const segments = normalized.split("/");
  const unsafe =
    normalized.length === 0 ||
    normalized.includes("\0") ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..");
  if (unsafe) throw new TypeError("workflow-action-v2: presentation contains an unsafe path");
  const compact = segments.filter((segment) => segment.length > 0).join("/");
  if (compact.length === 0) {
    throw new TypeError("workflow-action-v2: presentation contains an empty path");
  }
  return compact;
}

function normalizedPathSet(paths: readonly string[]): string[] {
  return [...new Set(paths.map(normalizedPresentationPath))].sort(compareUtf16CodeUnits);
}

function assertSameSet(
  label: string,
  presentation: readonly string[],
  canonical: readonly string[]
): void {
  const normalized = normalizedPathSet(presentation);
  if (
    normalized.length !== canonical.length ||
    normalized.some((value, index) => value !== canonical[index])
  ) {
    throw new TypeError(`workflow-action-v2: presentation ${label} does not match canonical scope`);
  }
}

function orderedOracles(envelope: CanonicalWorkflowActionEnvelope) {
  const byId = new Map(envelope.action.validationOracles.map((oracle) => [oracle.id, oracle]));
  if (byId.size !== envelope.action.validationOracles.length) {
    throw new TypeError("workflow-action-v2: canonical oracle IDs are not unique");
  }
  const ordered = envelope.v2Presentation.oracleOrder.map((id) => {
    const oracle = byId.get(id);
    if (oracle === undefined) {
      throw new TypeError("workflow-action-v2: presentation oracle does not exist canonically");
    }
    return oracle;
  });
  const canonicalIds = [...byId.keys()].sort(compareUtf16CodeUnits);
  const presentedIds = [...envelope.v2Presentation.oracleOrder].sort(compareUtf16CodeUnits);
  if (
    presentedIds.length !== canonicalIds.length ||
    presentedIds.some((id, index) => id !== canonicalIds[index])
  ) {
    throw new TypeError(
      "workflow-action-v2: presentation oracle set does not match canonical data"
    );
  }
  return ordered;
}

function renderFinding(finding: Finding): string {
  return finding.source === "policy" ? `${finding.code}: ${finding.message}` : finding.message;
}

function legacyFindings(envelope: CanonicalWorkflowActionEnvelope): string[] {
  const canonicalEntries = envelope.action.findings.map(
    (finding) => [canonicalFindingReference(finding), finding] as const
  );
  const byReference = new Map(canonicalEntries);
  if (byReference.size !== canonicalEntries.length) {
    throw new TypeError("workflow-action-v2: canonical finding references are not unique");
  }
  const permissionDecisionPresent = envelope.action.findings.some(
    (finding) =>
      (finding.source === "policy" && finding.effect === "blocks") ||
      finding.code === "VISP.CONTRACT.AUTHORITY_UNAVAILABLE"
  );
  const requiredReferences = new Set(
    canonicalEntries
      .filter(
        ([, finding]) =>
          finding.code === "VISP.FRESHNESS.REQUIRED_READ_UNAVAILABLE" ||
          (permissionDecisionPresent && finding.code === "VISP.WORKFLOW.STATE_BLOCKER")
      )
      .map(([reference]) => reference)
  );
  const presentedReferences = new Set(envelope.v2Presentation.findingOrder);
  if (
    presentedReferences.size !== requiredReferences.size ||
    [...presentedReferences].some((reference) => !requiredReferences.has(reference))
  ) {
    throw new TypeError(
      "workflow-action-v2: presentation finding set does not match canonical legacy findings"
    );
  }
  const ordered = envelope.v2Presentation.findingOrder.map((reference) => {
    const finding = byReference.get(reference);
    if (finding === undefined) {
      throw new TypeError("workflow-action-v2: presentation finding does not exist canonically");
    }
    if (
      finding.effect !== "blocks" &&
      finding.effect !== "uncertain" &&
      finding.code !== "VISP.WORKFLOW.STATE_BLOCKER"
    ) {
      throw new TypeError("workflow-action-v2: presentation finding is not a legacy v2 finding");
    }
    return finding;
  });
  const represented = new Set(envelope.v2Presentation.findingOrder);
  const authorityCoveredByBlocker =
    envelope.action.verdict === "inconclusive" &&
    envelope.action.nextCommand === "visp override validate" &&
    envelope.action.findings.some(
      (finding) => finding.code === "VISP.CONTRACT.AUTHORITY_UNAVAILABLE"
    ) &&
    ordered.some(
      (finding) =>
        finding.code === "VISP.WORKFLOW.STATE_BLOCKER" &&
        finding.message.startsWith("Override or gate evaluation is unavailable:")
    );
  const remaining = envelope.action.findings.filter(
    (finding) =>
      (finding.effect === "blocks" || finding.effect === "uncertain") &&
      !represented.has(canonicalFindingReference(finding)) &&
      !(authorityCoveredByBlocker && finding.code === "VISP.CONTRACT.AUTHORITY_UNAVAILABLE")
  );
  return [...new Set([...ordered, ...remaining].map(renderFinding))];
}

export function projectWorkflowActionV2(
  envelope: CanonicalWorkflowActionEnvelope
): WorkflowActionV2 {
  const action: CanonicalWorkflowAction = envelope.action;
  const { actionId, ...identityInput } = action;
  if (createWorkflowActionId(identityInput) !== actionId) {
    throw new TypeError("workflow-action-v2: canonical action identity is invalid");
  }
  assertSameSet(
    "writable paths",
    envelope.v2Presentation.writablePaths,
    action.scope.writablePaths
  );
  assertSameSet(
    "forbidden paths",
    envelope.v2Presentation.forbiddenPaths,
    action.scope.forbiddenPaths
  );

  return workflowActionV2Schema.parse({
    protocolVersion: "2.0",
    phase: v2Phase[action.phase],
    taskId: action.task?.id ?? null,
    goal: action.goal,
    requiredReads: action.requiredReads.map((read) => {
      if (!/^sha256:[a-f0-9]{64}$/u.test(read.contentHash)) {
        throw new TypeError("workflow-action-v2: canonical read hash is invalid");
      }
      return {
        path: read.path,
        role: v2ReadRole[read.role],
        sha256: read.contentHash.slice("sha256:".length)
      };
    }),
    writablePaths: [...envelope.v2Presentation.writablePaths],
    forbiddenPaths: [...envelope.v2Presentation.forbiddenPaths],
    acceptanceOracles: orderedOracles(envelope).map((oracle) => ({
      id: oracle.id,
      expectedBehavior: oracle.statement,
      validation: oracle.validationMethod
    })),
    validationCommands: [...action.validationCommands],
    assuranceLevel: action.assurance.level,
    verdict: action.verdict,
    findings: legacyFindings(envelope),
    nextCommand: action.nextCommand
  });
}

export function projectWorkflowActionV3(
  envelope: CanonicalWorkflowActionEnvelope
): WorkflowActionV3 {
  const { actionId, ...identityInput } = envelope.action;
  if (createWorkflowActionId(identityInput) !== actionId) {
    throw new TypeError("workflow-action-v3: canonical action identity is invalid");
  }

  return workflowActionV3Schema.parse({
    protocolVersion: "3.0",
    ...envelope.action
  });
}

export function projectWorkflowActionV31(
  envelope: CanonicalWorkflowActionEnvelopeV1_1
): WorkflowActionV31 {
  const { actionId, ...identityInput } = envelope.action;
  if (createWorkflowActionIdV1_1(identityInput) !== actionId) {
    throw new TypeError("workflow-action-v3.1: canonical action identity is invalid");
  }

  return workflowActionV31Schema.parse({
    protocolVersion: "3.1",
    ...envelope.action
  });
}

export async function buildWorkflowAction(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
  readonly protocol?: WorkflowActionProtocol;
}): Promise<WorkflowAction> {
  const protocol = input.protocol === undefined ? DEFAULT_WORKFLOW_ACTION_PROTOCOL : input.protocol;
  if (!isWorkflowActionProtocol(protocol)) {
    throw new TypeError(`Unsupported workflow-action protocol: ${JSON.stringify(protocol)}.`);
  }
  const envelope = await buildCanonicalWorkflowActionEnvelope(input);

  switch (protocol) {
    case "2.0":
      return projectWorkflowActionV2(envelope);
    case "3.0":
      return projectWorkflowActionV3(envelope);
    case "3.1":
      return projectWorkflowActionV31(
        await upgradeCanonicalWorkflowActionEnvelopeV1_1({
          state: input.state,
          envelope
        })
      );
  }
}

export async function buildWorkflowActionV2(input: {
  readonly state: ProjectState;
  readonly step: NextStep;
}): Promise<WorkflowActionV2> {
  return projectWorkflowActionV2(await buildCanonicalWorkflowActionEnvelope(input));
}
