import { type Preset } from "../artifacts/schemas/common.schema.js";
import { type PresetPack } from "../artifacts/schemas/preset.schema.js";

const dependencyFiles = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json"
];

export const builtinPresetPacks: Record<Preset, PresetPack> = {
  javascript: {
    name: "javascript",
    description: "JavaScript project workflow defaults.",
    validationCommandHints: ["npm test", "npm run lint", "npm run build"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.js", "**/*.spec.js"],
    contextIncludePatterns: ["src/**/*.js", "test/**/*.js", "tests/**/*.js"],
    securityChecklist: ["Check input validation.", "Check dependency changes."],
    reviewFocus: ["Changed source files", "Tests", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  typescript: {
    name: "typescript",
    description: "TypeScript project workflow defaults.",
    validationCommandHints: ["pnpm test", "pnpm typecheck", "pnpm build"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.ts", "**/*.spec.ts", "**/*.test.tsx", "**/*.spec.tsx"],
    contextIncludePatterns: ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts"],
    securityChecklist: ["Check runtime validation at input boundaries.", "Check dependency changes."],
    reviewFocus: ["Type safety", "Schema validation", "Tests", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  electron: {
    name: "electron",
    description: "Electron project workflow defaults.",
    validationCommandHints: ["pnpm test", "pnpm typecheck", "pnpm build"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.ts", "**/*.spec.ts"],
    contextIncludePatterns: ["src/**/*.ts", "electron/**/*.ts", "tests/**/*.ts"],
    securityChecklist: ["Check preload boundaries.", "Check IPC validation.", "Check dependency changes."],
    reviewFocus: ["Electron IPC", "Preload safety", "Renderer/main boundaries"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  react: {
    name: "react",
    description: "React application workflow defaults.",
    validationCommandHints: ["pnpm test", "pnpm typecheck", "pnpm build"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.tsx", "**/*.spec.tsx", "**/*.test.ts"],
    contextIncludePatterns: ["src/**/*.tsx", "src/**/*.ts", "tests/**/*.tsx"],
    securityChecklist: ["Check user input handling.", "Check dependency changes."],
    reviewFocus: ["Component behavior", "State transitions", "Accessibility-sensitive changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  "node-api": {
    name: "node-api",
    description: "Node API workflow defaults.",
    validationCommandHints: ["pnpm test", "pnpm typecheck", "pnpm build"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.ts", "**/*.spec.ts"],
    contextIncludePatterns: ["src/**/*.ts", "routes/**/*.ts", "controllers/**/*.ts", "tests/**/*.ts"],
    securityChecklist: ["Check API input validation.", "Check authorization boundaries.", "Check dependency changes."],
    reviewFocus: ["API validation", "Authorization", "Error handling", "Tests"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  generic: {
    name: "generic",
    description: "Generic repository workflow defaults.",
    validationCommandHints: ["npm test", "pnpm test"],
    dependencyFiles,
    testFilePatterns: ["**/*.test.*", "**/*.spec.*"],
    contextIncludePatterns: ["src/**/*", "tests/**/*"],
    securityChecklist: ["Check risky file changes.", "Check dependency changes."],
    reviewFocus: ["Task scope", "Traceability", "Validation evidence"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  }
};

export function builtinPresetPack(preset: Preset): PresetPack {
  return builtinPresetPacks[preset];
}
