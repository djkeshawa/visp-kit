import { type ProjectStatus } from "../artifacts/schemas/project.schema.js";

export type FeatureStatusUpdateInput = {
  readonly existing?: ProjectStatus;
  readonly featureId: string;
  readonly slug: string;
  readonly featurePath: string;
  readonly now: string;
};

export function updateStatusForFeatureIntent(
  input: FeatureStatusUpdateInput
): ProjectStatus {
  return {
    initialized: true,
    activeFeatureId: input.featureId,
    activeFeatureSlug: input.slug,
    activeFeaturePath: input.featurePath,
    currentState: "feature_intent_ready",
    lastCommand: "feature",
    createdAt: input.existing?.createdAt ?? input.now,
    updatedAt: input.now
  };
}
