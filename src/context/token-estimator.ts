export const tokenEstimatorName = "model-profile-conservative" as const;

export type TokenEstimateRange = {
  readonly estimate: number;
  readonly lowerBound: number;
  readonly upperBound: number;
  readonly profile: "generic-code";
  readonly uncertainty: "model-tokenizer-not-specified";
};

export function estimateTokenRange(text: string): TokenEstimateRange {
  const bytes = new TextEncoder().encode(text).length;
  return {
    estimate: Math.ceil(bytes / 4),
    lowerBound: Math.ceil(bytes / 5),
    upperBound: Math.ceil(bytes / 2.5),
    profile: "generic-code",
    uncertainty: "model-tokenizer-not-specified"
  };
}

export function estimateTokens(text: string): number {
  return estimateTokenRange(text).estimate;
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value, null, 2));
}
