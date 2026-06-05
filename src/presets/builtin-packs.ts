import { type Preset } from "../artifacts/schemas/common.schema.js";
import { type PresetPack } from "../artifacts/schemas/preset.schema.js";

const javascriptDependencyFiles = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  "npm-shrinkwrap.json"
];
const goDependencyFiles = ["go.mod", "go.sum"];
const javaDependencyFiles = [
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "gradle.lockfile"
];
const pythonDependencyFiles = [
  "pyproject.toml",
  "requirements.txt",
  "requirements-dev.txt",
  "poetry.lock",
  "uv.lock",
  "Pipfile",
  "Pipfile.lock"
];
const rustDependencyFiles = ["Cargo.toml", "Cargo.lock"];

export const builtinPresetPacks: Record<Preset, PresetPack> = {
  javascript: {
    name: "javascript",
    description: "JavaScript project workflow defaults.",
    validationCommandHints: ["npm test", "npm run lint", "npm run build"],
    dependencyFiles: javascriptDependencyFiles,
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
    dependencyFiles: javascriptDependencyFiles,
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
    dependencyFiles: javascriptDependencyFiles,
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
    dependencyFiles: javascriptDependencyFiles,
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
    dependencyFiles: javascriptDependencyFiles,
    testFilePatterns: ["**/*.test.ts", "**/*.spec.ts"],
    contextIncludePatterns: ["src/**/*.ts", "routes/**/*.ts", "controllers/**/*.ts", "tests/**/*.ts"],
    securityChecklist: ["Check API input validation.", "Check authorization boundaries.", "Check dependency changes."],
    reviewFocus: ["API validation", "Authorization", "Error handling", "Tests"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  go: {
    name: "go",
    description: "Go project workflow defaults.",
    validationCommandHints: ["go test ./...", "go vet ./...", "gofmt -l ."],
    dependencyFiles: goDependencyFiles,
    testFilePatterns: ["**/*_test.go"],
    contextIncludePatterns: ["**/*.go", "go.mod", "go.sum"],
    securityChecklist: ["Check package boundaries.", "Check error handling.", "Check dependency changes."],
    reviewFocus: ["Package boundaries", "Error handling", "Concurrency-sensitive changes", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  java: {
    name: "java",
    description: "Java project workflow defaults.",
    validationCommandHints: ["./gradlew test", "./gradlew check", "mvn test", "mvn verify"],
    dependencyFiles: javaDependencyFiles,
    testFilePatterns: ["src/test/**", "**/*Test.java", "**/*Tests.java"],
    contextIncludePatterns: ["src/main/**/*.java", "src/test/**/*.java", "pom.xml", "build.gradle", "build.gradle.kts"],
    securityChecklist: ["Check public API contracts.", "Check exception handling.", "Check dependency changes."],
    reviewFocus: ["Public APIs", "Service boundaries", "Exception handling", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  python: {
    name: "python",
    description: "Python project workflow defaults.",
    validationCommandHints: ["python -m pytest", "pytest", "ruff check .", "mypy ."],
    dependencyFiles: pythonDependencyFiles,
    testFilePatterns: ["tests/**/*.py", "test_*.py", "*_test.py"],
    contextIncludePatterns: ["src/**/*.py", "tests/**/*.py", "*.py", "pyproject.toml", "requirements*.txt"],
    securityChecklist: ["Check input validation.", "Check typing-sensitive changes.", "Check dependency changes."],
    reviewFocus: ["Input validation", "Typing", "Packaging", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  rust: {
    name: "rust",
    description: "Rust project workflow defaults.",
    validationCommandHints: ["cargo test", "cargo check", "cargo clippy --all-targets --all-features", "cargo fmt --check"],
    dependencyFiles: rustDependencyFiles,
    testFilePatterns: ["tests/**/*.rs", "**/*_test.rs"],
    contextIncludePatterns: ["src/**/*.rs", "tests/**/*.rs", "Cargo.toml", "Cargo.lock"],
    securityChecklist: ["Check unsafe code.", "Check error handling.", "Check dependency changes."],
    reviewFocus: ["Ownership and borrowing", "Error handling", "Unsafe code", "Dependency changes"],
    recommendedGates: ["context", "implement", "verify", "review", "reconcile", "pr"]
  },
  generic: {
    name: "generic",
    description: "Generic repository workflow defaults.",
    validationCommandHints: ["npm test", "pnpm test"],
    dependencyFiles: [
      ...javascriptDependencyFiles,
      ...goDependencyFiles,
      ...javaDependencyFiles,
      ...pythonDependencyFiles,
      ...rustDependencyFiles
    ],
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
