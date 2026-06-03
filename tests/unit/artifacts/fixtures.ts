import { type BudgetArtifact } from "../../../src/artifacts/schemas/budget.schema.js";
import { type ConstitutionArtifact } from "../../../src/artifacts/schemas/constitution.schema.js";
import { type ContextPack } from "../../../src/artifacts/schemas/context-pack.schema.js";
import { type Feature } from "../../../src/artifacts/schemas/feature.schema.js";
import { type PlanArtifact } from "../../../src/artifacts/schemas/plan.schema.js";
import {
  type ProjectConfig,
  type ProjectProfile
} from "../../../src/artifacts/schemas/project.schema.js";
import { type ReconcileReport } from "../../../src/artifacts/schemas/reconcile.schema.js";
import { type Requirement } from "../../../src/artifacts/schemas/requirement.schema.js";
import { type ReviewReport } from "../../../src/artifacts/schemas/review.schema.js";
import { type TaskGraphArtifact } from "../../../src/artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../../../src/artifacts/schemas/traceability.schema.js";
import { type VerificationReport } from "../../../src/artifacts/schemas/verification.schema.js";

export const timestamp = "2026-01-01T00:00:00.000Z";

export const validProjectProfile: ProjectProfile = {
  name: "visp-kit",
  rootPath: "/workspace/visp-kit",
  packageManager: "pnpm",
  languages: ["TypeScript"],
  frameworks: [],
  testFrameworks: ["Vitest"],
  buildCommands: ["pnpm build"],
  testCommands: ["pnpm test"],
  lintCommands: [],
  typecheckCommands: ["pnpm typecheck"],
  sourceRoots: ["src"],
  testRoots: ["tests"],
  ignoredPaths: ["node_modules", "dist"],
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validProjectConfig: ProjectConfig = {
  schemaVersion: "1",
  projectId: "visp-kit",
  budgetMode: "lean",
  preset: "generic",
  agent: "codex",
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validConstitution: ConstitutionArtifact = {
  id: "constitution",
  title: "Project Constitution",
  rules: [
    {
      id: "RULE-001",
      title: "Keep changes scoped",
      description: "Implement only the requested phase.",
      category: "workflow",
      severity: "must",
      appliesTo: ["all tasks"]
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validFeature: Feature = {
  id: "001",
  slug: "note-pinning",
  title: "Add note pinning",
  status: "draft",
  budgetMode: "lean",
  riskLevel: "low",
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validRequirement: Requirement = {
  id: "REQ-001",
  featureId: "001",
  title: "Pinned notes stay visible",
  description: "Pinned notes should appear before unpinned notes.",
  source: "user",
  priority: "must",
  acceptanceCriteria: [
    {
      id: "AC-001",
      requirementId: "REQ-001",
      description: "Pinned notes are sorted before unpinned notes.",
      testable: true,
      validationMethod: "unit"
    }
  ],
  assumptions: [
    {
      id: "ASM-001",
      description: "Existing note ordering remains stable within each group."
    }
  ],
  outOfScope: ["Cross-device sync changes"]
};

export const validPlan: PlanArtifact = {
  id: "PLAN-001",
  featureId: "001",
  summary: "Add the smallest sort change needed for note pinning.",
  decisions: [
    {
      id: "DEC-001",
      title: "Keep sort deterministic",
      decision: "Sort pinned notes before unpinned notes.",
      rationale: "This satisfies the required ordering without new state.",
      alternatives: ["Create a separate pinned list"],
      relatedRequirementIds: ["REQ-001"]
    }
  ],
  risks: [
    {
      id: "RISK-001",
      description: "Existing sort order could change unexpectedly.",
      level: "medium",
      mitigation: "Add unit coverage for pinned and unpinned ordering."
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validTaskGraph: TaskGraphArtifact = {
  featureId: "001",
  tasks: [
    {
      id: "T001",
      title: "Add note sorting helper",
      description: "Implement pinned-first sorting in the note module.",
      requirementIds: ["REQ-001"],
      acceptanceCriterionIds: ["AC-001"],
      dependsOn: [],
      allowedFiles: ["src/notes/sort.ts"],
      expectedFiles: ["tests/notes/sort.test.ts"],
      forbiddenFiles: ["package.json"],
      validationCommands: ["pnpm test"],
      status: "pending",
      parallelizable: false,
      riskLevel: "low"
    }
  ],
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validContextPack: ContextPack = {
  id: "CTX-T001",
  featureId: "001",
  featureSlug: "note-pinning",
  taskId: "T001",
  budgetMode: "lean",
  estimatedTokens: {
    input: 1200,
    expectedOutput: 1500,
    total: 2700,
    maxInput: 8000,
    mode: "lean",
    estimator: "chars-divided-by-four"
  },
  overBudget: false,
  recommendation: "OK",
  warnings: [],
  selectedTask: validTaskGraph.tasks[0]!,
  includedRequirements: [validRequirement],
  includedAcceptanceCriteria: validRequirement.acceptanceCriteria,
  includedPlanDecisions: [
    {
      id: "DEC-001",
      title: "Keep sort deterministic",
      summary: "Sort pinned notes before unpinned notes.",
      requirementIds: ["REQ-001"]
    }
  ],
  includedRisks: [
    {
      id: "RISK-001",
      description: "Existing sort order could change unexpectedly.",
      level: "medium",
      mitigation: "Add unit coverage for pinned and unpinned ordering.",
      requirementIds: ["REQ-001"]
    }
  ],
  includedDependencyTasks: [],
  includedConstitutionRules: [
    {
      id: "RULE-001",
      text: "Keep changes scoped."
    }
  ],
  includedProjectContext: {
    summary: "Project summary.",
    patterns: "",
    warnings: []
  },
  includedFiles: [
    {
      path: "src/notes/sort.ts",
      reason: "Primary implementation target.",
      includeMode: "full",
      hash: "abc123",
      language: "TypeScript",
      sizeBytes: 120,
      tokenEstimate: 100,
      summaryAvailable: true,
      snippetIncluded: true,
      summary: "{}"
    }
  ],
  includedSnippets: [
    {
      filePath: "src/notes/sort.ts",
      reason: "Existing sort test pattern.",
      startLine: 1,
      endLine: 12,
      content: "describe('sort notes', () => {})",
      tokenEstimate: 9
    }
  ],
  validationCommands: ["pnpm test"],
  constraints: ["Do not add production dependencies."],
  instructions: ["Implement only task T001."],
  createdAt: timestamp,
  updatedAt: timestamp
};

export const validVerificationReport: VerificationReport = {
  id: "VER-001-T001",
  featureId: "001",
  featureSlug: "note-pinning",
  taskId: "T001",
  mode: "targeted",
  startedAt: timestamp,
  endedAt: timestamp,
  durationMs: 300,
  success: true,
  summary: {
    passed: true,
    failed: false,
    warnings: 0,
    commandsRun: 1,
    commandsPassed: 1,
    commandsFailed: 0,
    artifactsChecked: 1,
    artifactsFailed: 0,
    scopeViolations: 0,
    dependencyViolations: 0
  },
  artifactValidation: {
    status: "passed",
    checked: [
      {
        path: ".visp/features/001-note-pinning/task-graph.json",
        required: true,
        present: true,
        passed: true,
        errors: [],
        warnings: []
      }
    ],
    warnings: [],
    errors: []
  },
  traceabilityValidation: {
    status: "passed",
    checkedTaskId: "T001",
    warnings: [],
    errors: []
  },
  commandValidation: {
    status: "passed",
    commands: [
      {
        command: "pnpm test",
        cwd: "/workspace/visp-kit",
        exitCode: 0,
        success: true,
        durationMs: 300,
        startedAt: timestamp,
        endedAt: timestamp,
        stdout: "pass",
        stderr: "",
        stdoutTruncated: false,
        stderrTruncated: false,
        skipped: false,
        skipReason: null,
        timedOut: false
      }
    ],
    warnings: [],
    errors: []
  },
  scopeValidation: {
    status: "passed",
    changedFiles: ["src/notes/sort.ts"],
    allowedFiles: ["src/notes/sort.ts"],
    expectedFiles: ["tests/notes/sort.test.ts"],
    forbiddenFiles: ["package.json"],
    outOfScopeFiles: [],
    forbiddenChangedFiles: [],
    unmappedChangedFiles: [],
    warnings: [],
    errors: []
  },
  dependencyValidation: {
    status: "passed",
    changedDependencyFiles: [],
    approvedByTaskScope: false,
    approvedByPlan: false,
    warnings: [],
    errors: []
  },
  warnings: [],
  errors: [],
  nextCommand: "visp review --diff-only"
};

export const validReviewReport: ReviewReport = {
  id: "REV-001-T001",
  featureId: "001",
  featureSlug: "note-pinning",
  taskId: "T001",
  mode: "task",
  startedAt: timestamp,
  endedAt: timestamp,
  durationMs: 100,
  success: true,
  result: "warnings",
  changedFiles: [
    {
      path: "src/notes/sort.ts",
      changeType: "modified",
      additions: 10,
      deletions: 2,
      inAllowedFiles: true,
      inExpectedFiles: false,
      inForbiddenFiles: false,
      isDependencyFile: false,
      isTestFile: false,
      isGeneratedVispFile: false,
      isBinary: false,
      diffTruncated: false,
      diff: "diff --git a/src/notes/sort.ts b/src/notes/sort.ts"
    }
  ],
  diffSummary: {
    filesChanged: 1,
    additions: 10,
    deletions: 2,
    truncatedFiles: 0,
    totalDiffTruncated: false,
    diffSource: "unstaged",
    baseRef: null
  },
  scopeReview: {
    status: "passed",
    allowedFiles: ["src/notes/sort.ts"],
    expectedFiles: ["tests/notes/sort.test.ts"],
    forbiddenFiles: ["package.json"],
    outOfScopeFiles: [],
    forbiddenChangedFiles: [],
    unmappedChangedFiles: [],
    warnings: [],
    errors: []
  },
  traceabilityReview: {
    status: "passed",
    requirementIds: ["REQ-001"],
    acceptanceCriterionIds: ["AC-001"],
    traceabilityFound: true,
    warnings: [],
    errors: []
  },
  verificationReview: {
    status: "passed",
    reportPath: ".visp/features/001-note-pinning/verification.json",
    verificationPassed: true,
    verificationTaskId: "T001",
    warnings: [],
    errors: []
  },
  testReview: {
    status: "warnings",
    testsChanged: false,
    validationCommandsKnown: true,
    behaviorChanging: true,
    verificationCommandsPassed: true,
    warnings: ["Behavior-changing task has no changed test files."],
    errors: []
  },
  dependencyReview: {
    status: "passed",
    changedDependencyFiles: [],
    approvedByTaskScope: false,
    approvedByPlan: false,
    warnings: [],
    errors: []
  },
  securityChecklist: [
    {
      id: "SEC001",
      category: "secrets",
      attention: "standard",
      text: "Confirm no secrets are exposed.",
      reason: "Standard security review item."
    }
  ],
  findings: [
    {
      id: "REVIEW001",
      category: "tests",
      severity: "warning",
      title: "No test files changed",
      description: "Behavior appears to change without test file changes.",
      file: null,
      evidence: "No test files changed.",
      recommendation: "Add tests or justify existing coverage.",
      relatedTaskId: "T001",
      relatedRequirementIds: ["REQ-001"],
      relatedAcceptanceCriterionIds: ["AC-001"]
    }
  ],
  warnings: ["Behavior-changing task has no changed test files."],
  errors: [],
  promptPath: ".visp/features/001-note-pinning/review/T001.review-prompt.md",
  reportPath: ".visp/features/001-note-pinning/review/T001.review.md",
  checklistPath: ".visp/features/001-note-pinning/review/T001.review-checklist.md",
  nextCommand: "visp reconcile --task T001"
};

export const validReconcileReport: ReconcileReport = {
  id: "REC-001-T001",
  featureId: "001",
  featureSlug: "note-pinning",
  taskId: "T001",
  mode: "task",
  startedAt: timestamp,
  endedAt: timestamp,
  durationMs: 100,
  success: true,
  result: "warnings",
  changedFiles: [
    {
      path: "src/notes/sort.ts",
      changeType: "modified",
      additions: 10,
      deletions: 2,
      mappingStatus: "mapped",
      isTestFile: false,
      isDependencyFile: false,
      isVispGeneratedFile: false,
      isAllowedByTask: true,
      isExpectedByTask: false,
      isForbiddenByTask: false,
      relatedTaskIds: ["T001"],
      relatedRequirementIds: ["REQ-001"],
      relatedAcceptanceCriterionIds: ["AC-001"],
      notes: ["allowed by task"]
    }
  ],
  taskAlignment: {
    status: "passed",
    taskExists: true,
    requirementLinks: ["REQ-001"],
    acceptanceCriterionLinks: ["AC-001"],
    changedFilesInScope: true,
    forbiddenFilesChanged: [],
    validationEvidenceFound: true,
    contextPackFound: true,
    warnings: [],
    errors: []
  },
  requirementCoverage: {
    status: "passed",
    items: [
      {
        requirementId: "REQ-001",
        acceptanceCriterionIds: ["AC-001"],
        taskIds: ["T001"],
        filePaths: ["src/notes/sort.ts"],
        status: "passed"
      }
    ],
    warnings: [],
    errors: []
  },
  fileMapping: {
    status: "passed",
    mappedFiles: ["src/notes/sort.ts"],
    unmappedFiles: [],
    forbiddenFiles: [],
    dependencyFiles: [],
    generatedFiles: [],
    warnings: [],
    errors: []
  },
  verificationEvidence: {
    status: "passed",
    reportPath: ".visp/features/001-note-pinning/verification.json",
    found: true,
    passed: true,
    result: "passed",
    warnings: [],
    errors: [],
    summary: ["1 commands passed", "0 commands failed"]
  },
  reviewEvidence: {
    status: "warnings",
    reportPath: ".visp/features/001-note-pinning/review/T001.review.json",
    found: true,
    passed: true,
    result: "warnings",
    warnings: ["Review report has warnings."],
    errors: [],
    summary: ["0 review errors", "1 review warnings"]
  },
  dependencyEvidence: {
    status: "passed",
    changedDependencyFiles: [],
    approvedByTaskScope: false,
    approvedByPlan: false,
    warnings: [],
    errors: []
  },
  traceabilityUpdate: {
    requested: false,
    performed: false,
    updatedFiles: [],
    skippedReason: "not requested"
  },
  findings: [
    {
      id: "REC001",
      category: "review",
      severity: "warning",
      driftType: "manual_review_needed",
      title: "Review warnings remain",
      description: "Review completed with warnings.",
      file: null,
      evidence: "Review report has warnings.",
      recommendation: "Review warnings before PR.",
      relatedTaskId: "T001",
      relatedRequirementIds: ["REQ-001"],
      relatedAcceptanceCriterionIds: ["AC-001"]
    }
  ],
  followUpSuggestions: ["Review warnings before PR."],
  warnings: ["Review report has warnings."],
  errors: [],
  reportPath: ".visp/features/001-note-pinning/reconcile/T001.reconcile.md",
  promptPath: ".visp/features/001-note-pinning/reconcile/T001.reconcile-prompt.md",
  nextCommand: "visp reconcile --task T001 --update-traceability"
};

export const validTraceabilityMatrix: TraceabilityMatrix = {
  featureId: "001",
  entries: [
    {
      requirementId: "REQ-001",
      acceptanceCriterionIds: ["AC-001"],
      taskIds: ["T001"],
      filePaths: ["src/notes/sort.ts"],
      testPaths: ["tests/notes/sort.test.ts"],
      status: "covered"
    }
  ],
  updatedAt: timestamp
};

export const validBudgetArtifact: BudgetArtifact = {
  policies: [
    {
      mode: "lean",
      maxEstimatedTokens: 6000,
      maxFullFiles: 1,
      maxIncludedFiles: 6,
      clarificationLevel: "blocking",
      reviewLevel: "diff",
      securityReview: "risk-based"
    }
  ],
  reports: [
    {
      id: "BUD-001",
      featureId: "001",
      mode: "lean",
      estimatedTokens: 1200,
      maxEstimatedTokens: 6000,
      withinBudget: true,
      notes: [],
      generatedAt: timestamp
    }
  ]
};
