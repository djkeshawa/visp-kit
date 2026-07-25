import { z } from "zod";

import { createAssuranceCaseHash } from "../../assurance/assurance-case-hash.js";
import {
  deriveAssuranceVerdict,
  deriveCandidateStateSha,
  deriveClaimDisposition,
  deriveEvidenceConclusion
} from "../../assurance/assurance-semantics.js";
import {
  commandStringSchema,
  idSchema,
  nonEmptyStringSchema,
  pathStringSchema,
  requirementPrioritySchema
} from "./common.schema.js";
import { assuranceProfileSchema, evidenceProviderIdentitySchema } from "./evidence.schema.js";
import { oracleSha256Schema } from "./oracle-plan.schema.js";
import { overrideRecordSchema } from "./override.schema.js";

export const assuranceCasePathSchema = pathStringSchema.superRefine((value, context) => {
  const segments = value.split("/");
  if (
    value.startsWith("/") ||
    /^[A-Za-z]:/u.test(value) ||
    value.includes("\\") ||
    segments.some((segment) => segment === "" || segment === "." || segment === "..")
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Path must be a normalized project-relative path."
    });
  }
});

export const assuranceCaseArtifactRoleSchema = z.enum([
  "policy",
  "specification",
  "plan",
  "task_graph",
  "context",
  "task",
  "oracle_plan",
  "oracle_lock",
  "baseline_evidence",
  "candidate_evidence",
  "diff_snapshot"
]);

const requiredArtifactRoles = assuranceCaseArtifactRoleSchema.options;

export const assuranceCaseArtifactBindingSchema = z.discriminatedUnion("status", [
  z
    .object({
      id: idSchema,
      role: assuranceCaseArtifactRoleSchema,
      status: z.literal("available"),
      path: assuranceCasePathSchema,
      sha256: oracleSha256Schema
    })
    .strict(),
  z
    .object({
      id: idSchema,
      role: assuranceCaseArtifactRoleSchema,
      status: z.literal("unavailable"),
      path: assuranceCasePathSchema,
      reason: nonEmptyStringSchema
    })
    .strict()
]);

export const assuranceCaseCodeStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("captured"),
      revision: nonEmptyStringSchema,
      sha256: oracleSha256Schema
    })
    .strict(),
  z
    .object({
      status: z.literal("unavailable"),
      reason: nonEmptyStringSchema
    })
    .strict()
]);

export const assuranceCaseChangeUnitSchema = z
  .discriminatedUnion("kind", [
    z
      .object({
        id: idSchema,
        kind: z.literal("file"),
        category: z.enum(["binary", "rename", "mode", "empty"]),
        detailSha256: oracleSha256Schema,
        beforePath: assuranceCasePathSchema.optional(),
        afterPath: assuranceCasePathSchema.optional(),
        beforeMode: z
          .string()
          .regex(/^[0-7]{6}$/u)
          .optional(),
        afterMode: z
          .string()
          .regex(/^[0-7]{6}$/u)
          .optional()
      })
      .strict(),
    z
      .object({
        id: idSchema,
        kind: z.literal("hunk"),
        path: assuranceCasePathSchema,
        oldStart: z.number().int().nonnegative(),
        oldLines: z.number().int().nonnegative(),
        newStart: z.number().int().nonnegative(),
        newLines: z.number().int().nonnegative(),
        patchSha256: oracleSha256Schema,
        occurrence: z.number().int().positive()
      })
      .strict()
  ])
  .superRefine((unit, context) => {
    if (unit.kind !== "file") return;

    if (unit.beforePath === undefined && unit.afterPath === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["beforePath"],
        message: "File change units require a before or after path."
      });
    }
    if (
      unit.category === "rename" &&
      (unit.beforePath === undefined ||
        unit.afterPath === undefined ||
        unit.beforePath === unit.afterPath)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Rename units require distinct before and after paths."
      });
    }
    if (unit.category === "mode" && unit.beforeMode === undefined && unit.afterMode === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Mode units require a before or after mode."
      });
    }
    if (
      unit.category === "mode" &&
      unit.beforeMode !== undefined &&
      unit.afterMode !== undefined &&
      unit.beforeMode === unit.afterMode
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Mode units with both modes require a real mode change."
      });
    }
    if (
      unit.category !== "mode" &&
      (unit.beforeMode !== undefined || unit.afterMode !== undefined)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["category"],
        message: "Only mode units may carry file modes."
      });
    }
  });

export const assuranceCaseClaimSchema = z
  .object({
    id: idSchema,
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("acceptance_criterion"),
          requirementId: idSchema,
          acceptanceCriterionId: idSchema
        })
        .strict(),
      z
        .object({
          kind: z.literal("invariant"),
          invariantId: idSchema,
          origin: z.enum(["business_rule", "non_functional"])
        })
        .strict()
    ]),
    priority: requirementPrioritySchema,
    assuranceProfile: assuranceProfileSchema,
    statement: nonEmptyStringSchema,
    disposition: z.enum(["mapped", "unresolved", "unmapped"]),
    changeUnitIds: z.array(idSchema),
    evidenceComparisonIds: z.array(idSchema),
    unresolvedItemIds: z.array(idSchema)
  })
  .strict();

const evidenceUncertaintySchema = z
  .object({
    status: z.enum(["none", "known", "unresolved"]),
    reasons: z.array(nonEmptyStringSchema)
  })
  .strict()
  .superRefine((uncertainty, context) => {
    if (uncertainty.status === "none" && uncertainty.reasons.length !== 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasons"],
        message: "Uncertainty reasons must be empty when uncertainty is none."
      });
    }
    if (uncertainty.status !== "none" && uncertainty.reasons.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["reasons"],
        message: "Known or unresolved uncertainty requires at least one reason."
      });
    }
  });

const evidenceOutcomeSchema = z
  .object({
    outcome: z.enum(["passed", "failed", "inconclusive", "not_applicable"]),
    source: z
      .object({
        bindingId: idSchema,
        evidenceIds: z.array(idSchema)
      })
      .strict(),
    freshness: z.enum(["fresh", "stale", "unknown"]),
    independence: z.enum([
      "pre_existing",
      "pre_approved",
      "implementer_authored",
      "independent_challenger",
      "human_attestation"
    ]),
    uncertainty: evidenceUncertaintySchema
  })
  .strict();

export const assuranceCaseEvidenceComparisonSchema = z
  .object({
    id: idSchema,
    providers: z.array(evidenceProviderIdentitySchema),
    claimIds: z.array(idSchema).min(1),
    baseline: evidenceOutcomeSchema,
    candidate: evidenceOutcomeSchema,
    conclusion: z.enum(["improved", "unchanged", "regressed", "inconclusive"])
  })
  .strict();

export const assuranceCaseHotspotSchema = z
  .object({
    id: idSchema,
    category: z.enum([
      "public_api",
      "dependency",
      "schema_migration",
      "security",
      "concurrency",
      "permissions",
      "deployment_configuration",
      "test_deletion",
      "test_weakening",
      "validation_command_change",
      "unmapped_change",
      "scope_expansion",
      "oversized_scope",
      "inconclusive_evidence",
      "override_usage",
      "generated_behavior"
    ]),
    path: assuranceCasePathSchema.nullable(),
    severity: z.enum(["critical", "high", "medium"]),
    mandatory: z.boolean(),
    reason: nonEmptyStringSchema,
    changeUnitIds: z.array(idSchema),
    claimIds: z.array(idSchema)
  })
  .strict()
  .superRefine((hotspot, context) => {
    if (
      hotspot.path === null &&
      hotspot.changeUnitIds.length === 0 &&
      hotspot.claimIds.length === 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Hotspots require a path, change unit, or claim."
      });
    }
  });

export const assuranceCaseAssumptionSchema = z
  .object({
    id: idSchema,
    statement: nonEmptyStringSchema,
    sourceBindingIds: z.array(idSchema)
  })
  .strict();

export const assuranceCaseUnresolvedItemSchema = z
  .object({
    id: idSchema,
    kind: z.enum(["claim", "evidence", "hotspot", "manual_check", "challenger_finding"]),
    reason: nonEmptyStringSchema,
    claimIds: z.array(idSchema)
  })
  .strict();

export const assuranceCaseOverrideSchema = z
  .object({
    id: idSchema,
    record: overrideRecordSchema,
    claimIds: z.array(idSchema)
  })
  .strict();

export const assuranceCaseManualCheckSchema = z
  .object({
    id: idSchema,
    description: nonEmptyStringSchema,
    status: z.enum(["pending", "passed", "failed", "not_applicable"]),
    claimIds: z.array(idSchema)
  })
  .strict();

export const assuranceCaseChallengerFindingSchema = z
  .object({
    id: idSchema,
    severity: z.enum(["critical", "high", "medium"]),
    status: z.enum(["open", "resolved", "accepted"]),
    summary: nonEmptyStringSchema,
    claimIds: z.array(idSchema)
  })
  .strict();

export const assuranceCaseWithoutHashSchema = z
  .object({
    version: z.literal("1.0"),
    actionId: oracleSha256Schema,
    featureId: idSchema,
    featureSlug: nonEmptyStringSchema,
    taskId: idSchema,
    assuranceProfile: assuranceProfileSchema,
    bindings: z.array(assuranceCaseArtifactBindingSchema),
    codeStates: z
      .object({
        baseline: assuranceCaseCodeStateSchema,
        candidate: assuranceCaseCodeStateSchema
      })
      .strict(),
    diff: z
      .object({
        mode: z.enum(["base_to_commit", "base_to_workspace"]),
        baseRevision: nonEmptyStringSchema,
        targetRevision: nonEmptyStringSchema,
        snapshotSha256: oracleSha256Schema,
        headRevision: z.string().regex(/^[a-f0-9]{40,64}$/u),
        indexTreeRevision: z.string().regex(/^[a-f0-9]{40,64}$/u),
        stateSha256: oracleSha256Schema
      })
      .strict(),
    changeUnits: z.array(assuranceCaseChangeUnitSchema),
    claims: z.array(assuranceCaseClaimSchema).min(1),
    evidenceComparisons: z.array(assuranceCaseEvidenceComparisonSchema),
    hotspots: z.array(assuranceCaseHotspotSchema),
    assumptions: z.array(assuranceCaseAssumptionSchema),
    unresolvedItems: z.array(assuranceCaseUnresolvedItemSchema),
    overrides: z.array(assuranceCaseOverrideSchema),
    manualChecks: z.array(assuranceCaseManualCheckSchema),
    challengerFindings: z.array(assuranceCaseChallengerFindingSchema),
    verdict: z.enum(["passed", "failed", "inconclusive"]),
    nextAction: z
      .object({
        command: commandStringSchema,
        reason: nonEmptyStringSchema
      })
      .strict()
  })
  .strict();

export type AssuranceCaseWithoutHash = z.infer<typeof assuranceCaseWithoutHashSchema>;

function validateSortedUniqueIds(
  values: readonly string[],
  path: (string | number)[],
  context: z.RefinementCtx
): void {
  for (let index = 0; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous !== undefined && previous >= current) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message:
          previous === current
            ? `Duplicate ID: ${current}.`
            : "IDs must be sorted in ascending order."
      });
    }
  }
}

function validateReferences(
  values: readonly string[],
  allowed: ReadonlySet<string>,
  path: (string | number)[],
  context: z.RefinementCtx
): void {
  validateSortedUniqueIds(values, path, context);
  for (const [index, value] of values.entries()) {
    if (!allowed.has(value)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: [...path, index],
        message: `Unknown referenced ID: ${value}.`
      });
    }
  }
}

export const assuranceCaseSchema = assuranceCaseWithoutHashSchema
  .extend({
    caseHash: oracleSha256Schema
  })
  .strict()
  .superRefine((assuranceCase, context) => {
    const entityCollections = [
      ["bindings", assuranceCase.bindings],
      ["changeUnits", assuranceCase.changeUnits],
      ["claims", assuranceCase.claims],
      ["evidenceComparisons", assuranceCase.evidenceComparisons],
      ["hotspots", assuranceCase.hotspots],
      ["assumptions", assuranceCase.assumptions],
      ["unresolvedItems", assuranceCase.unresolvedItems],
      ["overrides", assuranceCase.overrides],
      ["manualChecks", assuranceCase.manualChecks],
      ["challengerFindings", assuranceCase.challengerFindings]
    ] as const;

    for (const [path, values] of entityCollections) {
      validateSortedUniqueIds(
        values.map((value) => value.id),
        [path],
        context
      );
    }

    const bindingRoleCounts = new Map(
      requiredArtifactRoles.map((role) => [
        role,
        assuranceCase.bindings.filter((binding) => binding.role === role).length
      ])
    );
    for (const [role, count] of bindingRoleCounts) {
      if (count !== 1) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["bindings"],
          message: `Assurance cases require exactly one ${role} binding.`
        });
      }
    }

    const seenEntityIds = new Map<string, string>();
    for (const [path, values] of entityCollections) {
      for (const [index, value] of values.entries()) {
        const previousPath = seenEntityIds.get(value.id);
        if (previousPath !== undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [path, index, "id"],
            message: `Entity ID ${value.id} is already used at ${previousPath}.`
          });
        } else {
          seenEntityIds.set(value.id, `${path}.${index}`);
        }
      }
    }

    const bindingIds = new Set(assuranceCase.bindings.map((value) => value.id));
    const changeUnitIds = new Set(assuranceCase.changeUnits.map((value) => value.id));
    const claimIds = new Set(assuranceCase.claims.map((value) => value.id));
    const comparisonIds = new Set(assuranceCase.evidenceComparisons.map((value) => value.id));
    const unresolvedItemIds = new Set(assuranceCase.unresolvedItems.map((value) => value.id));

    for (const [index, claim] of assuranceCase.claims.entries()) {
      validateReferences(
        claim.changeUnitIds,
        changeUnitIds,
        ["claims", index, "changeUnitIds"],
        context
      );
      validateReferences(
        claim.evidenceComparisonIds,
        comparisonIds,
        ["claims", index, "evidenceComparisonIds"],
        context
      );
      validateReferences(
        claim.unresolvedItemIds,
        unresolvedItemIds,
        ["claims", index, "unresolvedItemIds"],
        context
      );

      const expectedDisposition = deriveClaimDisposition(claim);
      if (claim.disposition !== expectedDisposition) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["claims", index, "disposition"],
          message: `Claim disposition must be ${expectedDisposition} for its authoritative mappings.`
        });
      }
      if (
        claim.disposition === "mapped" &&
        claim.changeUnitIds.length === 0 &&
        claim.evidenceComparisonIds.length === 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["claims", index, "disposition"],
          message: "Mapped claims require a change unit or evidence comparison."
        });
      }
      if (claim.disposition === "unresolved" && claim.unresolvedItemIds.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["claims", index, "unresolvedItemIds"],
          message: "Unresolved claims require an unresolved item."
        });
      }
      if (claim.disposition !== "unresolved" && claim.unresolvedItemIds.length > 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["claims", index, "unresolvedItemIds"],
          message: "Only unresolved claims may reference unresolved items."
        });
      }
    }

    for (const [index, comparison] of assuranceCase.evidenceComparisons.entries()) {
      for (let providerIndex = 0; providerIndex < comparison.providers.length; providerIndex += 1) {
        const previous = comparison.providers[providerIndex - 1];
        const current = comparison.providers[providerIndex]!;
        if (
          previous !== undefined &&
          `${previous.id}\0${previous.version}` >= `${current.id}\0${current.version}`
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, "providers", providerIndex],
            message: "Evidence providers must be unique and sorted by ID and version."
          });
        }
      }
      validateReferences(
        comparison.claimIds,
        claimIds,
        ["evidenceComparisons", index, "claimIds"],
        context
      );
      for (const side of ["baseline", "candidate"] as const) {
        if (
          comparison.providers.length === 0 &&
          (comparison[side].outcome === "passed" || comparison[side].outcome === "failed")
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, "providers"],
            message: `${side} passing or failing outcomes require an actual evidence provider.`
          });
        }
        const expectedRole = side === "baseline" ? "baseline_evidence" : "candidate_evidence";
        const sourceBinding = assuranceCase.bindings.find(
          (binding) => binding.id === comparison[side].source.bindingId
        );
        validateReferences(
          [comparison[side].source.bindingId],
          bindingIds,
          ["evidenceComparisons", index, side, "source", "bindingId"],
          context
        );
        if (sourceBinding !== undefined && sourceBinding.role !== expectedRole) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "source", "bindingId"],
            message: `${side} evidence must use the ${expectedRole} binding.`
          });
        }
        if (sourceBinding?.status === "unavailable") {
          if (
            comparison[side].outcome !== "inconclusive" ||
            comparison[side].freshness !== "unknown" ||
            comparison[side].uncertainty.status !== "unresolved" ||
            comparison[side].source.evidenceIds.length !== 0
          ) {
            context.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["evidenceComparisons", index, side],
              message: "Unavailable evidence must remain empty, unknown, and inconclusive."
            });
          }
        }
        if (
          comparison[side].freshness !== "fresh" &&
          comparison[side].uncertainty.status === "none"
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "uncertainty"],
            message: "Non-fresh evidence requires explicit uncertainty."
          });
        }
        if (comparison[side].freshness !== "fresh" && comparison[side].outcome === "passed") {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "outcome"],
            message: "Non-fresh evidence cannot establish a passing outcome."
          });
        }
        if (
          comparison[side].uncertainty.status !== "none" &&
          comparison[side].outcome === "passed"
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "outcome"],
            message: "Uncertain evidence cannot establish a passing outcome."
          });
        }
        if (
          comparison[side].source.evidenceIds.length === 0 &&
          (comparison[side].outcome === "passed" || comparison[side].outcome === "failed")
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "source", "evidenceIds"],
            message: "Passing or failing outcomes require cited evidence IDs."
          });
        }
        if (
          comparison[side].uncertainty.status !== "none" &&
          comparison[side].uncertainty.reasons.length === 0
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["evidenceComparisons", index, side, "uncertainty", "reasons"],
            message: "Evidence uncertainty requires reasons."
          });
        }
        validateSortedUniqueIds(
          comparison[side].source.evidenceIds,
          ["evidenceComparisons", index, side, "source", "evidenceIds"],
          context
        );
        validateSortedUniqueIds(
          comparison[side].uncertainty.reasons,
          ["evidenceComparisons", index, side, "uncertainty", "reasons"],
          context
        );
      }
      const expectedConclusion = deriveEvidenceConclusion(
        comparison.baseline,
        comparison.candidate
      );
      if (comparison.conclusion !== expectedConclusion) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["evidenceComparisons", index, "conclusion"],
          message: `Evidence conclusion must be ${expectedConclusion}.`
        });
      }
    }

    for (const [index, hotspot] of assuranceCase.hotspots.entries()) {
      validateReferences(
        hotspot.changeUnitIds,
        changeUnitIds,
        ["hotspots", index, "changeUnitIds"],
        context
      );
      validateReferences(hotspot.claimIds, claimIds, ["hotspots", index, "claimIds"], context);
    }

    for (const [index, assumption] of assuranceCase.assumptions.entries()) {
      validateReferences(
        assumption.sourceBindingIds,
        bindingIds,
        ["assumptions", index, "sourceBindingIds"],
        context
      );
    }

    const claimReferenceCollections = [
      ["unresolvedItems", assuranceCase.unresolvedItems],
      ["overrides", assuranceCase.overrides],
      ["manualChecks", assuranceCase.manualChecks],
      ["challengerFindings", assuranceCase.challengerFindings]
    ] as const;
    for (const [path, values] of claimReferenceCollections) {
      for (const [index, value] of values.entries()) {
        validateReferences(value.claimIds, claimIds, [path, index, "claimIds"], context);
      }
    }

    const expectedVerdict = deriveAssuranceVerdict(assuranceCase);
    if (assuranceCase.verdict !== expectedVerdict) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["verdict"],
        message: `Assurance verdict must be ${expectedVerdict}.`
      });
    }
    const candidateBinding = assuranceCase.bindings.find(
      (binding) => binding.role === "candidate_evidence"
    );
    if (
      candidateBinding !== undefined &&
      (assuranceCase.codeStates.candidate.status !== "captured" ||
        assuranceCase.codeStates.candidate.sha256 !==
          deriveCandidateStateSha({
            actionId: assuranceCase.actionId,
            diffStateSha256: assuranceCase.diff.stateSha256,
            candidateEvidenceBinding: candidateBinding
          }))
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["codeStates", "candidate"],
        message: "Candidate code state is not bound to action, diff, and evidence identity."
      });
    }

    const { caseHash, ...withoutHash } = assuranceCase;
    if (caseHash !== createAssuranceCaseHash(withoutHash)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["caseHash"],
        message: "Case hash does not match the canonical assurance case content."
      });
    }
  });

export type AssuranceCase = z.infer<typeof assuranceCaseSchema>;
