import {
  type BudgetMode,
  type Preset
} from "../artifacts/schemas/common.schema.js";

export type PresetGuidance = {
  readonly title: string;
  readonly guidance: readonly string[];
};

export const presetGuidance: Record<Preset, PresetGuidance> = {
  generic: {
    title: "Generic",
    guidance: ["Use broadly applicable engineering principles."]
  },
  javascript: {
    title: "JavaScript",
    guidance: [
      "Keep modules focused.",
      "Prefer clear named exports where appropriate.",
      "Avoid mixing UI, domain, and persistence concerns.",
      "Use existing lint and test conventions."
    ]
  },
  typescript: {
    title: "TypeScript",
    guidance: [
      "Prefer explicit types for public APIs.",
      "Avoid unsafe any unless justified.",
      "Keep schema validation close to boundaries.",
      "Run typecheck for behavior changes."
    ]
  },
  electron: {
    title: "Electron",
    guidance: [
      "Separate main, preload, and renderer concerns.",
      "Avoid unsafe IPC patterns.",
      "Avoid exposing broad APIs from preload.",
      "Keep file-system access explicit and scoped."
    ]
  },
  react: {
    title: "React",
    guidance: [
      "Keep components small.",
      "Separate UI components from business logic where practical.",
      "Maintain accessibility basics.",
      "Follow existing styling conventions."
    ]
  },
  "node-api": {
    title: "Node API",
    guidance: [
      "Validate request inputs.",
      "Keep handlers and controllers thin.",
      "Separate business logic from the transport layer.",
      "Handle errors consistently."
    ]
  }
};

export const budgetGuidance: Record<BudgetMode, readonly string[]> = {
  lean: [
    "Use the smallest sufficient context.",
    "Prefer fewer AI calls and compact rationale.",
    "Keep implementation task-specific."
  ],
  balanced: [
    "Use the normal spec, plan, task, and validation workflow.",
    "Use moderate validation.",
    "Include enough context for accuracy without overloading."
  ],
  strict: [
    "Use stronger validation.",
    "Expect security and risk review in later phases.",
    "Keep traceability explicit before implementation."
  ]
};
