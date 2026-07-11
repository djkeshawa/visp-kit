import { type ClarificationArtifact } from "../artifacts/schemas/clarification.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";

function request(feature: ActiveFeature): string {
  return feature.intent.rawUserRequest;
}

export function createClarificationArtifact(input: {
  readonly feature: ActiveFeature;
  readonly now: string;
}): ClarificationArtifact {
  return {
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    status: "draft_invalid",
    questions: [
      {
        id: "CQ001",
        question: "TBD",
        category: "behavior",
        blocking: true,
        recommendedDefault: "TBD",
        reason: "TBD",
        status: "unanswered",
        answer: ""
      }
    ],
    assumptions: [
      {
        id: "CA001",
        text: "Follow existing project conventions.",
        reason: "Preserves consistency.",
        source: "constitution",
        accepted: true
      }
    ],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function renderClarificationsMarkdown(feature: ActiveFeature): string {
  return `# Clarifications: ${feature.intent.title}

## Feature

- ID: ${feature.id}
- Slug: ${feature.slug}
- Title: ${feature.intent.title}
- Budget mode: ${feature.intent.budgetMode}
- Risk level: ${feature.intent.riskLevel}

## Source Intent

${request(feature)}

## Blocking Questions

Use this section for questions that materially affect implementation correctness.

| ID | Question | Recommended Default | Reason | Status |
|----|----------|---------------------|--------|--------|
| CQ001 | TBD | TBD | TBD | unanswered |

## Non-Blocking Assumptions

Use this section for safe defaults that do not need to block the workflow.

| ID | Assumption | Reason | Source |
|----|------------|--------|--------|
| CA001 | Follow existing project conventions. | Preserves consistency. | constitution |

## Clarification Rules

A clarification is blocking only if a wrong assumption could cause:
- incorrect business behavior
- security or permission issues
- data model changes
- API or event contract mismatch
- migration risk
- meaningful rework across modules

Do not ask cosmetic questions unless the feature is explicitly UI, design, or brand-focused.

## How to Use

1. Use \`.visp/prompts/clarify.prompt.md\` with your AI coding tool to refine this file.
2. Answer or accept defaults for blocking questions.
3. Re-run \`visp clarify --validate\`.
4. Run \`visp spec\`.
`;
}

function tableText(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "TBD";
}

export function renderClarificationsMarkdownFromArtifact(input: {
  readonly feature: ActiveFeature;
  readonly artifact: ClarificationArtifact;
}): string {
  const questions = input.artifact.questions
    .map(
      (question) =>
        `| ${question.id} | ${tableText(question.question)} | ${tableText(question.recommendedDefault)} | ${tableText(question.reason)} | ${question.status} | ${tableText(question.answer)} |`
    )
    .join("\n");
  const assumptions = input.artifact.assumptions
    .map(
      (assumption) =>
        `| ${assumption.id} | ${tableText(assumption.text)} | ${tableText(assumption.reason)} | ${assumption.source} | ${assumption.accepted ? "yes" : "no"} |`
    )
    .join("\n");

  return `# Clarifications: ${input.feature.intent.title}

## Feature

- ID: ${input.feature.id}
- Slug: ${input.feature.slug}
- Title: ${input.feature.intent.title}
- Status: ${input.artifact.status}

## Source Intent

${request(input.feature)}

## Blocking Questions

| ID | Question | Recommended Default | Reason | Status | Answer |
|----|----------|---------------------|--------|--------|--------|
${questions}

## Non-Blocking Assumptions

| ID | Assumption | Reason | Source | Accepted |
|----|------------|--------|--------|----------|
${assumptions}

## Next Step

Run:

visp spec
`;
}

export function createSpecArtifact(input: {
  readonly feature: ActiveFeature;
  readonly now: string;
}): SpecArtifact {
  const acceptanceCriterion = {
    id: "AC001",
    requirementId: "REQ001",
    description: "TBD",
    testable: true,
    validationMethod: "unit" as const
  };

  return {
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    title: input.feature.intent.title,
    status: "draft_invalid",
    userStories: [
      {
        id: "US001",
        title: "TBD",
        actor: "user",
        capability: "TBD",
        outcome: "TBD"
      }
    ],
    requirements: [
      {
        id: "REQ001",
        featureId: input.feature.id,
        title: "TBD",
        description: "TBD",
        source: "user",
        priority: "must",
        acceptanceCriteria: [acceptanceCriterion],
        assumptions: [],
        outOfScope: []
      }
    ],
    acceptanceCriteria: [acceptanceCriterion],
    businessRules: ["TBD"],
    nonFunctionalRequirements: {
      performance: ["TBD"],
      security: ["TBD"],
      accessibility: ["TBD"],
      reliability: ["TBD"],
      maintainability: ["TBD"]
    },
    edgeCases: ["TBD"],
    assumptions: [],
    outOfScope: ["TBD"],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function renderSpecMarkdown(feature: ActiveFeature): string {
  return `# Specification: ${feature.intent.title}

## Feature

- ID: ${feature.id}
- Slug: ${feature.slug}
- Status: draft

## Source Intent

${request(feature)}

## Clarification Summary

- TBD

## User Stories

### US001: <story title>

As a <user/actor>, I want <capability>, so that <outcome>.

## Functional Requirements

### REQ001: <requirement title>

Description:
TBD

Priority:
must

Source:
user

Acceptance Criteria:
- AC001: TBD

## Acceptance Criteria

### AC001

Requirement: REQ001  
Description: TBD  
Validation method: unit  
Testable: true

## Business Rules

- TBD

## Non-Functional Requirements

- Performance: TBD
- Security: TBD
- Accessibility: TBD
- Reliability: TBD
- Maintainability: TBD

## Edge Cases

- TBD

## Assumptions

- TBD

## Out of Scope

- TBD

## Traceability Seed

| Requirement | Acceptance Criteria | Source | Notes |
|-------------|---------------------|--------|-------|
| REQ001 | AC001 | user | TBD |

## Next Step

Run:

visp plan
`;
}

export function createTraceabilitySeed(input: {
  readonly feature: ActiveFeature;
  readonly spec: SpecArtifact;
  readonly now: string;
}): TraceabilityMatrix {
  return {
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    entries: input.spec.requirements.map((requirement) => ({
      requirementId: requirement.id,
      acceptanceCriterionIds: requirement.acceptanceCriteria.map((criterion) => criterion.id),
      planDecisionIds: [],
      taskIds: [],
      filePaths: [],
      testPaths: [],
      testRefs: [],
      status: "missing"
    })),
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function renderTraceabilityMarkdown(input: {
  readonly title: string;
  readonly traceability: TraceabilityMatrix;
}): string {
  const rows = input.traceability.entries
    .map(
      (entry) =>
        `| ${entry.requirementId} | ${entry.acceptanceCriterionIds.join(", ") || "TBD"} | ${entry.planDecisionIds?.join(", ") || "TBD"} | ${entry.taskIds.join(", ") || "TBD"} | ${entry.testRefs?.join(", ") || "TBD"} | ${entry.status} |`
    )
    .join("\n");

  return `# Traceability: ${input.title}

| Requirement | Acceptance Criteria | Plan Items | Tasks | Tests | Status |
|-------------|---------------------|------------|-------|-------|--------|
${rows}
`;
}

export function createPlanDraftArtifact(input: {
  readonly feature: ActiveFeature;
  readonly now: string;
}): PlanDraftArtifact {
  return {
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    status: "draft_invalid",
    evidence: {
      knownFromUser: [request(input.feature)],
      knownFromSpecification: ["TBD"],
      knownFromCodebase: ["TBD"],
      knownFromConstitution: ["TBD"],
      inferred: ["TBD"],
      assumed: ["TBD"],
      unknown: ["TBD"]
    },
    affectedModules: [
      {
        moduleOrFileArea: "TBD",
        reason: "TBD",
        evidence: "TBD"
      }
    ],
    implementationApproach: "TBD",
    impacts: {
      dataModel: "None known / TBD",
      api: "None known / TBD",
      ui: "None known / TBD",
      securityPrivacy: "None known / TBD",
      performance: "None known / TBD"
    },
    testingStrategy: [
      {
        level: "unit",
        whatToTest: "TBD",
        validationCommand: "TBD"
      }
    ],
    rollbackStrategy: "TBD",
    alternatives: [
      {
        option: "TBD",
        decision: "rejected",
        reason: "TBD"
      }
    ],
    dependencies: {
      newDependenciesRequired: false,
      notes: "No new dependencies approved.",
      requiresApproval: false
    },
    risks: [
      {
        id: "RISK001",
        description: "TBD",
        level: "medium",
        mitigation: "TBD",
        requirementIds: ["REQ001"]
      }
    ],
    decisions: [
      {
        id: "PD001",
        title: "TBD",
        decision: "TBD",
        reason: "TBD",
        evidence: "TBD",
        impacts: "TBD",
        requirementIds: ["REQ001"]
      }
    ],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function renderPlanMarkdown(feature: ActiveFeature): string {
  return `# Implementation Plan: ${feature.intent.title}

## Feature

- ID: ${feature.id}
- Slug: ${feature.slug}
- Status: draft

## Inputs

- Spec: \`${feature.relativePath}/spec.md\`
- Project profile: \`.visp/project.json\`
- Project summary: \`.visp/memory/project-summary.md\`
- Constitution: \`.visp/memory/constitution.compact.md\`

## Evidence Summary

### Known from user

- ${request(feature)}

### Known from specification

- TBD

### Known from codebase

- TBD

### Known from constitution

- TBD

### Inferred

- TBD

### Assumed

- TBD

### Unknown

- TBD

## Architecture Summary

TBD

## Affected Modules

| Module/File Area | Reason | Evidence |
|------------------|--------|----------|
| TBD | TBD | TBD |

## Implementation Approach

TBD

## Data Model Impact

- None known / TBD

## API Impact

- None known / TBD

## UI Impact

- None known / TBD

## Security and Privacy Impact

- None known / TBD

## Performance Impact

- None known / TBD

## Testing Strategy

| Level | What to Test | Validation Command |
|-------|--------------|--------------------|
| unit | TBD | TBD |

## Rollback Strategy

TBD

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
| TBD | rejected | TBD |

## Dependencies

- New dependencies required: no
- If yes, explain why and require approval.

## Risks

| ID | Risk | Level | Mitigation |
|----|------|-------|------------|
| RISK001 | TBD | medium | TBD |

## Plan Decisions

### PD001: <decision title>

Decision:
TBD

Reason:
TBD

Evidence:
TBD

Impacts:
TBD

## Next Step

Run:

visp tasks
`;
}

export function createTaskGraphArtifact(input: {
  readonly feature: ActiveFeature;
  readonly now: string;
}): TaskGraphArtifact {
  return {
    featureId: input.feature.id,
    featureSlug: input.feature.slug,
    status: "draft_invalid",
    tasks: [
      {
        id: "T001",
        title: "TBD",
        description: "TBD",
        requirementIds: ["REQ001"],
        acceptanceCriterionIds: ["AC001"],
        dependsOn: [],
        allowedFiles: ["TBD"],
        expectedFiles: ["TBD"],
        forbiddenFiles: [
          "Dependency manifests and lockfiles unless dependency approval is part of this task"
        ],
        validationCommands: ["TBD"],
        status: "pending",
        parallelizable: false,
        riskLevel: "medium"
      }
    ],
    createdAt: input.now,
    updatedAt: input.now
  };
}

export function renderTasksMarkdown(feature: ActiveFeature): string {
  return `# Task Graph: ${feature.intent.title}

## Feature

- ID: ${feature.id}
- Slug: ${feature.slug}
- Status: draft

## Task Rules

- Keep tasks small.
- Implement one task at a time.
- Every task must map to at least one requirement.
- Every behavior-changing task should map to at least one acceptance criterion.
- Tasks should list allowed files where known.
- Tasks should include validation commands where known.
- Avoid broad refactoring.
- Avoid unapproved dependencies.

## Tasks

### T001: <task title>

Status:
ready

Description:
TBD

Requirements:
- REQ001

Acceptance Criteria:
- AC001

Depends On:
- none

Allowed Files:
- TBD

Expected Files:
- TBD

Forbidden Files:
- Dependency manifests and lockfiles unless dependency approval is part of this task

Validation Commands:
- TBD

Parallelizable:
false

Risk:
medium

## Suggested Implementation Order

1. T001

## Next Step

Run:

visp context T001

Note:
Run \`visp context T001\`, then use \`.visp/prompts/current-task.prompt.md\` with your agent to implement the selected task.
`;
}

export function traceabilityWithTasks(input: {
  readonly traceability: TraceabilityMatrix;
  readonly taskGraph: TaskGraphArtifact;
  readonly now: string;
}): TraceabilityMatrix {
  return {
    ...input.traceability,
    entries: input.traceability.entries.map((entry) => ({
      ...entry,
      taskIds: input.taskGraph.tasks
        .filter((task) => task.requirementIds.includes(entry.requirementId))
        .map((task) => task.id),
      status: "partial"
    })),
    updatedAt: input.now
  };
}
