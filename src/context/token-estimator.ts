export const tokenEstimatorName = "heuristic-v1" as const;

const wordPattern = /[A-Za-z0-9_]+/g;
const symbolRunPattern = /[^\sA-Za-z0-9_]+/g;

export function estimateTokens(text: string): number {
  if (text.length === 0) return 0;

  let heuristic = 0;

  // Words tokenize roughly per ~5 characters (subword splits for long words).
  for (const match of text.matchAll(wordPattern)) {
    heuristic += Math.max(1, Math.ceil(match[0].length / 5));
  }

  // Punctuation and symbol runs (dense in code and JSON) tokenize separately
  // from words, roughly one token per two symbol characters.
  for (const match of text.matchAll(symbolRunPattern)) {
    heuristic += Math.ceil(match[0].length / 2);
  }

  // Keep chars/4 as a floor so budget estimates never drop below the previous
  // estimator; over-estimating is safer than overrunning a real budget.
  return Math.max(Math.ceil(text.length / 4), heuristic);
}

export function estimateJsonTokens(value: unknown): number {
  return estimateTokens(JSON.stringify(value, null, 2));
}
