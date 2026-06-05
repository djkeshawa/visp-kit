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
  },
  go: {
    title: "Go",
    guidance: [
      "Keep package boundaries clear.",
      "Prefer explicit error handling.",
      "Avoid broad global state.",
      "Run Go validation commands for behavior changes."
    ]
  },
  java: {
    title: "Java",
    guidance: [
      "Keep service and domain boundaries clear.",
      "Preserve public API contracts.",
      "Handle exceptions consistently.",
      "Use existing Maven or Gradle conventions."
    ]
  },
  python: {
    title: "Python",
    guidance: [
      "Keep modules focused and import boundaries clear.",
      "Preserve typing and runtime validation where present.",
      "Avoid hidden global state.",
      "Use existing test and lint conventions."
    ]
  },
  rust: {
    title: "Rust",
    guidance: [
      "Keep ownership and borrowing changes explicit.",
      "Avoid unsafe code unless explicitly approved.",
      "Use clear error types and propagation.",
      "Run cargo validation commands for behavior changes."
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
