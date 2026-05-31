import {
  type BudgetMode,
  type Preset
} from "../artifacts/schemas/common.schema.js";

export type ConstitutionRule = {
  readonly id: string;
  readonly text: string;
  readonly category: "base" | "preset" | "budget";
};

const baseRules = [
  "Keep functions small, specific, and readable.",
  "Follow existing project structure and conventions.",
  "Do not introduce dependencies without explicit approval.",
  "Write or update tests for behavior changes.",
  "Avoid unrelated refactoring.",
  "Keep AI context task-specific and token-efficient.",
  "Every implementation task should map to requirements and acceptance criteria.",
  "Prefer deterministic validation before reporting completion.",
  "Review diffs against task scope before accepting changes.",
  "Preserve existing project style unless a task explicitly changes it."
] as const;

const presetRules: Record<Preset, readonly string[]> = {
  generic: [],
  javascript: [
    "Keep JavaScript modules focused.",
    "Avoid mixing UI, domain, and persistence concerns."
  ],
  typescript: [
    "Use explicit types for public TypeScript APIs.",
    "Keep runtime schema validation close to input boundaries."
  ],
  electron: [
    "Keep Electron main, preload, and renderer concerns separated.",
    "Avoid broad or unsafe IPC exposure."
  ],
  react: [
    "Keep React components small and accessible.",
    "Avoid unnecessary global state."
  ],
  "node-api": [
    "Validate API request inputs.",
    "Keep handlers thin and domain logic separate."
  ]
};

const budgetRules: Record<BudgetMode, readonly string[]> = {
  lean: ["Prefer the smallest sufficient context and concise rationale."],
  balanced: ["Use enough context and validation for accurate implementation."],
  strict: ["Use explicit traceability, risk checks, and stronger validation."]
};

function numberedRule(
  text: string,
  index: number,
  category: ConstitutionRule["category"]
): ConstitutionRule {
  return {
    id: `C${String(index + 1).padStart(3, "0")}`,
    text,
    category
  };
}

export function buildConstitutionRules(
  preset: Preset,
  budget: BudgetMode
): ConstitutionRule[] {
  const rules = [
    ...baseRules.map((text) => ({ text, category: "base" as const })),
    ...presetRules[preset].map((text) => ({ text, category: "preset" as const })),
    ...budgetRules[budget].map((text) => ({ text, category: "budget" as const }))
  ];

  return rules.map((rule, index) => numberedRule(rule.text, index, rule.category));
}
