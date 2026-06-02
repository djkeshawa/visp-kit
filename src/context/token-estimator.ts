export const tokenEstimatorName = "chars-divided-by-four" as const;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value, null, 2));
}
