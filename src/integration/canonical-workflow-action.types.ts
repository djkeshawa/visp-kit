/**
 * The wire shape of a canonical workflow action.
 *
 * Split out of `canonical-workflow-action.ts` so the builders there read as
 * logic rather than as a preamble of three hundred lines of declarations.
 * These are the versioned protocol types; `canonical-workflow-action.ts`
 * re-exports every one of them, so no importer needs to know they moved.
 */
import { type AppliedPolicyOverride, type PolicyStatus } from "../artifacts/schemas/gate.schema.js";
import {
  type RiskFactor,
  type RequirementPriority,
  type RiskLevel,
  type TaskClass,
  type ValidationMethod
} from "../artifacts/schemas/common.schema.js";
import {
  type AssuranceProfile,
  type EvidenceProviderIdentity,
  type EvidenceRequirement,
  type EvidenceResult,
  type EvidenceStatus
} from "../artifacts/schemas/evidence.schema.js";
import { type ProviderFailureCode } from "../artifacts/schemas/provider-run.schema.js";
import { type StrictnessMode } from "../artifacts/schemas/policy.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { type Sha256Hash } from "./canonical-json.js";

export type {
  RiskFactor,
  RiskFactorCode,
  TaskClass
} from "../artifacts/schemas/common.schema.js";
export type {
  AssuranceProfile,
  EvidenceRequirement
} from "../artifacts/schemas/evidence.schema.js";

export type DeclaredUnavailableReason =
  | "not_in_source_artifact"
  | "not_in_protocol"
  | "source_missing"
  | "source_invalid"
  | "not_captured"
  | "unsupported";

export type DeclaredNotApplicableReason =
  | "no_active_feature"
  | "no_active_task"
  | "stage_does_not_require_value";

export type DeclaredValue<T> =
  | { readonly state: "available"; readonly value: T }
  | { readonly state: "unavailable"; readonly reasonCode: DeclaredUnavailableReason }
  | { readonly state: "not_applicable"; readonly reasonCode: DeclaredNotApplicableReason };

export type CanonicalWorkflowPhase =
  | "next"
  | "setup"
  | "feature"
  | "clarify"
  | "spec"
  | "plan"
  | "tasks"
  | "context"
  | "implement"
  | "verify"
  | "review"
  | "reconcile"
  | "pr";

export type OperationLimits = {
  readonly version: "1.0";
  readonly maxChangedFiles: number;
  readonly dependencyChangesAllowed: boolean;
};

export type HashedReadRole =
  | "policy"
  | "intent"
  | "specification"
  | "plan"
  | "task_graph"
  | "context_pack"
  | "implementation_prompt"
  | "oracle_plan";

export type HashedRead = {
  readonly id: string;
  readonly role: HashedReadRole;
  readonly path: string;
  readonly contentHash: Sha256Hash;
  readonly freshness: "content_hash";
};

export type RequirementClaim = {
  readonly id: string;
  readonly statement: string;
  readonly priority: RequirementPriority;
  readonly acceptanceCriterionIds: readonly string[];
  readonly accountableOwner: DeclaredValue<string>;
};

export type ValidationOracle = {
  readonly id: string;
  readonly claimId: string;
  readonly statement: string;
  readonly testable: boolean;
  readonly validationMethod: ValidationMethod;
};

export type Finding = {
  readonly code: string;
  readonly source: "policy" | "workflow" | "contract" | "freshness";
  readonly severity: "info" | "warning" | "error";
  readonly effect: "none" | "blocks" | "uncertain";
  readonly message: string;
  readonly recommendation: string;
  readonly evidence: readonly string[];
};

export type ActionVerdict = "ready" | "blocked" | "inconclusive";

export type CanonicalWorkflowActionIdentityInput = {
  readonly canonicalVersion: "1.0";
  readonly phase: CanonicalWorkflowPhase;
  readonly feature: { readonly id: string; readonly slug: string } | null;
  readonly task: {
    readonly id: string;
    readonly title: string;
    readonly status: Task["status"];
    readonly dependsOn: readonly string[];
    readonly parallelizable: boolean;
  } | null;
  readonly taskClass: DeclaredValue<TaskClass>;
  readonly risk: {
    readonly level: DeclaredValue<RiskLevel>;
    readonly factors: DeclaredValue<readonly RiskFactor[]>;
  };
  readonly assurance: {
    readonly level: "kit_strict" | "advisory";
    readonly profile: DeclaredValue<AssuranceProfile>;
    readonly workflowStrictness: DeclaredValue<StrictnessMode>;
  };
  readonly goal: string;
  readonly baseCommit: DeclaredValue<string>;
  readonly requiredReads: readonly HashedRead[];
  readonly scope: {
    readonly writablePaths: readonly string[];
    readonly expectedPaths: DeclaredValue<readonly string[]>;
    readonly forbiddenPaths: readonly string[];
    readonly operationLimits: DeclaredValue<OperationLimits>;
  };
  readonly claims: DeclaredValue<readonly RequirementClaim[]>;
  readonly validationOracles: readonly ValidationOracle[];
  readonly validationCommands: readonly string[];
  readonly requiredEvidence: DeclaredValue<readonly EvidenceRequirement[]>;
  readonly policy: {
    readonly status: DeclaredValue<PolicyStatus>;
    readonly appliedOverrides: DeclaredValue<readonly AppliedPolicyOverride[]>;
  };
  readonly findings: readonly Finding[];
  readonly verdict: ActionVerdict;
  readonly nextCommand: string;
};

export type CanonicalWorkflowAction = CanonicalWorkflowActionIdentityInput & {
  readonly actionId: Sha256Hash;
};

export type CanonicalEvidenceResultSummary = {
  readonly id: string;
  readonly requirementId: string;
  readonly target: EvidenceResult["target"];
  readonly freshness: EvidenceResult["freshness"];
  readonly independence: EvidenceResult["independence"];
  readonly outcome: EvidenceResult["outcome"];
};

export type CanonicalEvidenceProviderSummary = {
  readonly id: string;
  readonly provider: EvidenceProviderIdentity;
  readonly status: "passed" | "inconclusive";
  readonly failure: {
    readonly code: ProviderFailureCode;
    readonly reason: string;
  } | null;
  readonly results: readonly CanonicalEvidenceResultSummary[];
};

export type CanonicalEvidenceSummary = {
  readonly version: "1.0";
  readonly source: "baseline" | "candidate";
  readonly artifact: {
    readonly path: string;
    readonly contentHash: Sha256Hash;
  };
  readonly generatedAt: string;
  readonly outcome: EvidenceStatus;
  readonly freshness: "fresh" | "stale" | "unknown";
  readonly providers: readonly CanonicalEvidenceProviderSummary[];
  readonly testStrength: DeclaredValue<{
    readonly status: "passed" | "inconclusive";
    readonly independence: readonly ("pre_existing" | "pre_approved")[];
    readonly reason: string;
  }>;
};

export type CanonicalWorkflowActionV1_1IdentityInput = Omit<
  CanonicalWorkflowActionIdentityInput,
  "canonicalVersion"
> & {
  readonly canonicalVersion: "1.1";
  readonly evidence: DeclaredValue<CanonicalEvidenceSummary>;
};

export type CanonicalWorkflowActionV1_1 = CanonicalWorkflowActionV1_1IdentityInput & {
  readonly actionId: Sha256Hash;
};

export type CanonicalAssuranceReviewDecisionSummary = {
  readonly required: boolean;
  readonly status: "current" | "missing" | "rejected" | "stale" | "invalid";
  readonly decisionHash: Sha256Hash | null;
  readonly reason: string;
};

export type CanonicalAssuranceSummary =
  | {
      readonly state: "available";
      readonly version: "1.0";
      readonly artifact: {
        readonly path: string;
        readonly contentHash: Sha256Hash;
      };
      readonly caseHash: Sha256Hash;
      readonly verdict: "passed" | "failed" | "inconclusive";
      readonly mandatoryHotspots: readonly {
        readonly id: string;
        readonly category:
          | "public_api"
          | "dependency"
          | "schema_migration"
          | "security"
          | "concurrency"
          | "permissions"
          | "deployment_configuration"
          | "test_deletion"
          | "test_weakening"
          | "validation_command_change"
          | "unmapped_change"
          | "scope_expansion"
          | "oversized_scope"
          | "inconclusive_evidence"
          | "override_usage"
          | "generated_behavior";
        readonly severity: "critical" | "high" | "medium";
        readonly path: string | null;
        readonly reason: string;
      }[];
      readonly reviewDecision: CanonicalAssuranceReviewDecisionSummary;
    }
  | {
      readonly state: "unavailable";
      readonly reason: string;
      readonly reviewDecision: CanonicalAssuranceReviewDecisionSummary & {
        readonly decisionHash: null;
      };
    };

export type CanonicalWorkflowActionV1_2IdentityInput = Omit<
  CanonicalWorkflowActionV1_1IdentityInput,
  "canonicalVersion"
> & {
  readonly canonicalVersion: "1.2";
  readonly assuranceSummary: CanonicalAssuranceSummary;
};

export type CanonicalWorkflowActionV1_2 = CanonicalWorkflowActionV1_2IdentityInput & {
  readonly actionId: Sha256Hash;
};

// 1.3 carries the same fields as 1.2; only the identity computation changes:
// the actionId hashes a projection that excludes command wording (D-119).
export type CanonicalWorkflowActionV1_3IdentityInput = Omit<
  CanonicalWorkflowActionV1_2IdentityInput,
  "canonicalVersion"
> & {
  readonly canonicalVersion: "1.3";
};

export type CanonicalWorkflowActionV1_3 = CanonicalWorkflowActionV1_3IdentityInput & {
  readonly actionId: Sha256Hash;
};

export type CanonicalWorkflowActionV2Presentation = {
  readonly writablePaths: readonly string[];
  readonly forbiddenPaths: readonly string[];
  readonly oracleOrder: readonly string[];
  readonly findingOrder: readonly Sha256Hash[];
};

export type CanonicalWorkflowActionEnvelope = {
  readonly action: CanonicalWorkflowAction;
  readonly v2Presentation: CanonicalWorkflowActionV2Presentation;
};

export type CanonicalWorkflowActionEnvelopeV1_1 = {
  readonly action: CanonicalWorkflowActionV1_1;
  readonly v2Presentation: CanonicalWorkflowActionV2Presentation;
};

export type CanonicalWorkflowActionEnvelopeV1_2 = {
  readonly action: CanonicalWorkflowActionV1_2;
  readonly v2Presentation: CanonicalWorkflowActionV2Presentation;
};

export type CanonicalWorkflowActionEnvelopeV1_3 = {
  readonly action: CanonicalWorkflowActionV1_3;
  readonly v2Presentation: CanonicalWorkflowActionV2Presentation;
};
