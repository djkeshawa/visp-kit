import {
  type ReviewFinding,
  type ReviewFindingCategory,
  type ReviewFindingSeverity
} from "../artifacts/schemas/review.schema.js";

export type ReviewFindingDraft = Omit<ReviewFinding, "id">;

export function finding(input: {
  readonly category: ReviewFindingCategory;
  readonly severity: ReviewFindingSeverity;
  readonly title: string;
  readonly description: string;
  readonly file?: string | null;
  readonly evidence: string;
  readonly recommendation: string;
  readonly relatedTaskId?: string | null;
  readonly relatedRequirementIds?: readonly string[];
  readonly relatedAcceptanceCriterionIds?: readonly string[];
}): ReviewFindingDraft {
  return {
    category: input.category,
    severity: input.severity,
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

export function numberFindings(
  drafts: readonly ReviewFindingDraft[]
): readonly ReviewFinding[] {
  return drafts.map((draft, index) => ({
    id: `REVIEW${String(index + 1).padStart(3, "0")}`,
    ...draft
  }));
}
