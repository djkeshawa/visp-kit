import {
  type DriftType,
  type ReconcileFinding
} from "../artifacts/schemas/reconcile.schema.js";

export type ReconcileFindingDraft = Omit<ReconcileFinding, "id">;

export function reconcileFinding(input: {
  readonly category: ReconcileFinding["category"];
  readonly severity: ReconcileFinding["severity"];
  readonly driftType: DriftType;
  readonly title: string;
  readonly description: string;
  readonly file?: string | null;
  readonly evidence: string;
  readonly recommendation: string;
  readonly relatedTaskId?: string | null;
  readonly relatedRequirementIds?: readonly string[];
  readonly relatedAcceptanceCriterionIds?: readonly string[];
}): ReconcileFindingDraft {
  return {
    category: input.category,
    severity: input.severity,
    driftType: input.driftType,
    title: input.title,
    description: input.description,
    file: input.file ?? null,
    evidence: input.evidence,
    recommendation: input.recommendation,
    relatedTaskId: input.relatedTaskId ?? null,
    relatedRequirementIds: [...(input.relatedRequirementIds ?? [])],
    relatedAcceptanceCriterionIds: [...(input.relatedAcceptanceCriterionIds ?? [])]
  };
}

export function numberReconcileFindings(
  drafts: readonly ReconcileFindingDraft[]
): readonly ReconcileFinding[] {
  return drafts.map((draft, index) => ({
    id: `REC${String(index + 1).padStart(3, "0")}`,
    ...draft
  }));
}
