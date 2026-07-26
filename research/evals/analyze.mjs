import { readFile } from "node:fs/promises";

const input = process.argv[2];
if (!input) throw new Error("usage: node analyze.mjs <runs.jsonl>");
const runs = (await readFile(input, "utf8"))
  .split(/\r?\n/u)
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const success = (run) =>
  run.failToPassPassed &&
  run.passToPassPassed &&
  !run.scopeViolation &&
  run.requirementsCovered &&
  !run.humanCorrection;

const groups = groupBy(runs, (run) => `${run.modelId}\t${run.condition}`);
const summaries = [...groups].map(([key, values]) => {
  const [modelId, condition] = key.split("\t");
  const successes = values.filter(success).length;
  return {
    modelId,
    condition,
    runs: values.length,
    tasks: new Set(values.map((run) => run.taskId)).size,
    compositeSuccessRate: successes / values.length,
    medianTokens: median(values.map(tokens)),
    medianCost: median(values.map((run) => run.monetaryCost).filter(Number.isFinite)),
    medianWallTimeMs: median(values.map((run) => run.wallTimeMs))
  };
});

const comparisons = [];
for (const modelId of new Set(runs.map((run) => run.modelId))) {
  const modelRuns = runs.filter((run) => run.modelId === modelId);
  const baseline = modelRuns.filter((run) => run.condition === "native_raw");
  for (const condition of new Set(modelRuns.map((run) => run.condition))) {
    if (condition === "native_raw") continue;
    const candidate = modelRuns.filter((run) => run.condition === condition);
    const paired = pairRuns(baseline, candidate);
    if (paired.length === 0) continue;
    const differences = paired.map(([base, next]) => Number(success(next)) - Number(success(base)));
    const ci = pairedTaskBootstrap(paired, 5000, hashSeed(`${modelId}:${condition}`));
    const b = paired.filter(([base, next]) => success(base) && !success(next)).length;
    const c = paired.filter(([base, next]) => !success(base) && success(next)).length;
    const baselineTokens = median(paired.map(([base]) => tokens(base)));
    const candidateTokens = median(paired.map(([, next]) => tokens(next)));
    comparisons.push({
      modelId,
      baseline: "native_raw",
      condition,
      pairs: paired.length,
      taskCount: new Set(paired.map(([base]) => base.taskId)).size,
      successDifference: mean(differences),
      pairedBootstrap95: ci,
      mcnemar: { baselineOnly: b, candidateOnly: c, exactP: exactMcNemar(b, c) },
      medianTokenReduction: baselineTokens === 0 ? null : 1 - candidateTokens / baselineTokens,
      accuracyClaimSupported: ci.lower > 0,
      efficiencyClaimSupported:
        ci.lower >= -0.05 && baselineTokens > 0 && candidateTokens <= baselineTokens * 0.8
    });
  }
}
applyHolmCorrection(comparisons);

process.stdout.write(
  `${JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      primaryOutcome: "composite first-attempt success",
      groups: summaries,
      pairedComparisons: comparisons
    },
    null,
    2
  )}\n`
);

function pairRuns(baseline, candidate) {
  const byKey = new Map(candidate.map((run) => [`${run.taskId}\t${run.seed}`, run]));
  return baseline.flatMap((run) => {
    const match = byKey.get(`${run.taskId}\t${run.seed}`);
    return match ? [[run, match]] : [];
  });
}

function pairedTaskBootstrap(pairs, iterations, seed) {
  const taskGroups = [...groupBy(pairs, ([base]) => base.taskId).values()];
  const random = mulberry32(seed);
  const estimates = [];
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const sampled = Array.from(
      { length: taskGroups.length },
      () => taskGroups[Math.floor(random() * taskGroups.length)]
    ).flat();
    estimates.push(
      mean(sampled.map(([base, next]) => Number(success(next)) - Number(success(base))))
    );
  }
  estimates.sort((a, b) => a - b);
  return {
    lower: percentile(estimates, 0.025),
    upper: percentile(estimates, 0.975),
    iterations,
    unit: "task"
  };
}

function exactMcNemar(b, c) {
  const n = b + c;
  if (n === 0) return 1;
  const tail = Math.min(b, c);
  let probability = 0;
  for (let k = 0; k <= tail; k += 1) probability += combination(n, k) * 0.5 ** n;
  return Math.min(1, 2 * probability);
}

function applyHolmCorrection(items) {
  const ordered = [...items].sort((a, b) => a.mcnemar.exactP - b.mcnemar.exactP);
  let previous = 0;
  ordered.forEach((item, index) => {
    const adjusted = Math.min(1, (ordered.length - index) * item.mcnemar.exactP);
    item.mcnemar.holmAdjustedP = Math.max(previous, adjusted);
    previous = item.mcnemar.holmAdjustedP;
  });
}

function tokens(run) {
  return run.inputTokens + run.outputTokens;
}
function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
}
function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
function groupBy(values, key) {
  const map = new Map();
  for (const value of values) {
    const k = key(value);
    map.set(k, [...(map.get(k) ?? []), value]);
  }
  return map;
}
function combination(n, k) {
  let value = 1;
  for (let i = 1; i <= k; i += 1) value = (value * (n - k + i)) / i;
  return value;
}
function hashSeed(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function mulberry32(seed) {
  return () => {
    seed += 0x6d2b79f5;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
