import { type ClarificationArtifact } from "../artifacts/schemas/clarification.schema.js";
import { type PlanDraftArtifact } from "../artifacts/schemas/plan.schema.js";
import { type SpecArtifact } from "../artifacts/schemas/spec.schema.js";
import { type Task, type TaskGraphArtifact } from "../artifacts/schemas/task.schema.js";
import { type TraceabilityMatrix } from "../artifacts/schemas/traceability.schema.js";
import { type ActiveFeature } from "../workflows/shared/active-feature.js";

function request(feature: ActiveFeature): string {
  return feature.intent.rawUserRequest;
}

function tableText(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\|/g, "\\|").trim() || "none";
}

function idList(values: readonly string[] | undefined): string {
  return tableText((values ?? []).join(", "));
}

function bulletList(values: readonly string[] | undefined): string {
  const items = (values ?? []).map((value) => value.trim()).filter((value) => value.length > 0);

  return items.length === 0 ? "- none" : items.map((item) => `- ${item}`).join("\n");
}

function blockText(value: string | undefined): string {
  const trimmed = (value ?? "").trim();

  return trimmed.length === 0 ? "none" : trimmed;
}

function tableRows(rows: readonly string[], emptyRow: string): string {
  return rows.length === 0 ? emptyRow : rows.join("\n");
}

function sections(blocks: readonly string[], empty: string): string {
  return blocks.length === 0 ? empty : blocks.join("\n\n");
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
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
      },
      // Arrives ANSWERED, unlike CQ001. Only the author knows the behaviour
      // question; this one has the same safe answer for every feature, so the
      // template decides it and records the decision rather than adding a
      // gate. Ten rounds of weak-model evaluation taught the rule this
      // follows: every improvement that worked REMOVED a required step, and
      // every added step got abandoned under load. Secure by default with an
      // audit trail beats one more question to skip — and the author can
      // still overwrite the answer when a feature needs something stricter.
      //
      // It exists because of a measured failure: given the same vague request
      // on an 8,800-line codebase, two agents both built a new error surface
      // that printed raw error strings — in a project whose own code masks
      // every printed error because those strings carry connection
      // credentials. Clarify asked what to SHOW and never what must not be.
      {
        id: "CQ002",
        question: "What must never appear in this feature's output, logs, or error messages?",
        category: "security",
        blocking: false,
        recommendedDefault:
          "Credentials, connection strings, tokens, keys, and personal data. Reuse this project's existing masking or redaction helpers instead of formatting raw values into output.",
        reason:
          "Failure paths are where secrets escape: error and logging surfaces are written under pressure, on the least-tested path, and rarely reviewed for what they expose.",
        status: "accepted_default",
        answer:
          "Credentials, connection strings, tokens, keys, and personal data. Reuse this project's existing masking or redaction helpers instead of formatting raw values into output."
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

visp-kit spec
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

export function renderSpecMarkdownFromArtifact(input: {
  readonly feature: ActiveFeature;
  readonly artifact: SpecArtifact;
}): string {
  const spec = input.artifact;
  const userStories = sections(
    spec.userStories.map(
      (story) =>
        `### ${story.id}: ${story.title}

As a ${story.actor}, I want ${story.capability}, so that ${story.outcome}.`
    ),
    "None recorded."
  );
  const requirements = sections(
    spec.requirements.map(
      (requirement) =>
        `### ${requirement.id}: ${requirement.title}

Feature:
${requirement.featureId}

Description:
${blockText(requirement.description)}

Priority:
${requirement.priority}

Source:
${requirement.source}

Acceptance Criteria:
${bulletList(requirement.acceptanceCriteria.map((criterion) => `${criterion.id}: ${criterion.description}`))}

Assumptions:
${bulletList(requirement.assumptions.map((assumption) => `${assumption.id}: ${assumption.description}`))}

Out of Scope:
${bulletList(requirement.outOfScope)}`
    ),
    "None recorded."
  );
  const acceptanceCriteria = sections(
    spec.acceptanceCriteria.map(
      (criterion) =>
        `### ${criterion.id}

Requirement: ${criterion.requirementId}
Description: ${tableText(criterion.description)}
Validation method: ${criterion.validationMethod}
Testable: ${yesNo(criterion.testable)}`
    ),
    "None recorded."
  );

  return `# Specification: ${spec.title}

## Feature

- ID: ${spec.featureId}
- Slug: ${spec.featureSlug}
- Status: ${spec.status}

## Source Intent

${request(input.feature)}

## Clarifications

See \`${input.feature.relativePath}/clarifications.md\`.

## User Stories

${userStories}

## Functional Requirements

${requirements}

## Acceptance Criteria

${acceptanceCriteria}

## Business Rules

${bulletList(spec.businessRules)}

## Non-Functional Requirements

### Performance

${bulletList(spec.nonFunctionalRequirements.performance)}

### Security

${bulletList(spec.nonFunctionalRequirements.security)}

### Accessibility

${bulletList(spec.nonFunctionalRequirements.accessibility)}

### Reliability

${bulletList(spec.nonFunctionalRequirements.reliability)}

### Maintainability

${bulletList(spec.nonFunctionalRequirements.maintainability)}

## Edge Cases

${bulletList(spec.edgeCases)}

## Assumptions

${bulletList(spec.assumptions.map((assumption) => `${assumption.id}: ${assumption.description}`))}

## Out of Scope

${bulletList(spec.outOfScope)}

## Next Step

Run:

visp-kit plan
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

export function renderTraceabilityMarkdownFromArtifact(input: {
  readonly feature: ActiveFeature;
  readonly traceability: TraceabilityMatrix;
}): string {
  const rows = tableRows(
    input.traceability.entries.map(
      (entry) =>
        `| ${entry.requirementId} | ${idList(entry.acceptanceCriterionIds)} | ${idList(entry.planDecisionIds)} | ${idList(entry.taskIds)} | ${idList(entry.filePaths)} | ${idList(entry.testPaths)} | ${idList(entry.testRefs)} | ${entry.status} |`
    ),
    "| none | none | none | none | none | none | none | missing |"
  );

  return `# Traceability: ${input.feature.intent.title}

## Feature

- ID: ${input.traceability.featureId}
- Slug: ${input.traceability.featureSlug ?? input.feature.slug}

## Matrix

| Requirement | Acceptance Criteria | Plan Decisions | Tasks | Files | Tests | Test Refs | Status |
|-------------|---------------------|----------------|-------|-------|-------|-----------|--------|
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

export function renderPlanMarkdownFromArtifact(input: {
  readonly feature: ActiveFeature;
  readonly artifact: PlanDraftArtifact;
}): string {
  const plan = input.artifact;
  const affectedModules = tableRows(
    plan.affectedModules.map(
      (module) =>
        `| ${tableText(module.moduleOrFileArea)} | ${tableText(module.reason)} | ${tableText(module.evidence)} |`
    ),
    "| none | none | none |"
  );
  const testingStrategy = tableRows(
    plan.testingStrategy.map(
      (item) =>
        `| ${tableText(item.level)} | ${tableText(item.whatToTest)} | ${tableText(item.validationCommand)} |`
    ),
    "| none | none | none |"
  );
  const alternatives = tableRows(
    plan.alternatives.map(
      (alternative) =>
        `| ${tableText(alternative.option)} | ${tableText(alternative.decision)} | ${tableText(alternative.reason)} |`
    ),
    "| none | none | none |"
  );
  const risks = tableRows(
    plan.risks.map(
      (risk) =>
        `| ${risk.id} | ${tableText(risk.description)} | ${risk.level} | ${tableText(risk.mitigation)} | ${idList(risk.requirementIds)} |`
    ),
    "| none | none | none | none | none |"
  );
  const decisions = sections(
    plan.decisions.map(
      (decision) =>
        `### ${decision.id}: ${decision.title}

Decision:
${blockText(decision.decision)}

Reason:
${blockText(decision.reason)}

Evidence:
${blockText(decision.evidence)}

Impacts:
${blockText(decision.impacts)}

Requirements:
${bulletList(decision.requirementIds)}`
    ),
    "None recorded."
  );

  return `# Implementation Plan: ${input.feature.intent.title}

## Feature

- ID: ${plan.featureId}
- Slug: ${plan.featureSlug}
- Status: ${plan.status}

## Inputs

- Spec: \`${input.feature.relativePath}/spec.md\`
- Project profile: \`.visp/project.json\`
- Project summary: \`.visp/memory/project-summary.md\`
- Constitution: \`.visp/memory/constitution.compact.md\`

## Evidence Summary

### Known from user

${bulletList(plan.evidence.knownFromUser)}

### Known from specification

${bulletList(plan.evidence.knownFromSpecification)}

### Known from codebase

${bulletList(plan.evidence.knownFromCodebase)}

### Known from constitution

${bulletList(plan.evidence.knownFromConstitution)}

### Inferred

${bulletList(plan.evidence.inferred)}

### Assumed

${bulletList(plan.evidence.assumed)}

### Unknown

${bulletList(plan.evidence.unknown)}

## Affected Modules

| Module/File Area | Reason | Evidence |
|------------------|--------|----------|
${affectedModules}

## Implementation Approach

${blockText(plan.implementationApproach)}

## Data Model Impact

- ${tableText(plan.impacts.dataModel)}

## API Impact

- ${tableText(plan.impacts.api)}

## UI Impact

- ${tableText(plan.impacts.ui)}

## Security and Privacy Impact

- ${tableText(plan.impacts.securityPrivacy)}

## Performance Impact

- ${tableText(plan.impacts.performance)}

## Testing Strategy

| Level | What to Test | Validation Command |
|-------|--------------|--------------------|
${testingStrategy}

## Rollback Strategy

${blockText(plan.rollbackStrategy)}

## Alternatives Considered

| Option | Decision | Reason |
|--------|----------|--------|
${alternatives}

## Dependencies

- New dependencies required: ${yesNo(plan.dependencies.newDependenciesRequired)}
- Requires approval: ${yesNo(plan.dependencies.requiresApproval)}
- Notes: ${tableText(plan.dependencies.notes)}

## Risks

| ID | Risk | Level | Mitigation | Requirements |
|----|------|-------|------------|--------------|
${risks}

## Plan Decisions

${decisions}

## Next Step

Run:

visp-kit tasks
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

function topologicalTaskOrder(tasks: readonly Task[]): readonly string[] {
  const known = new Set<string>();
  const pending: { readonly id: string; readonly dependsOn: readonly string[] }[] = [];

  for (const task of tasks) {
    if (known.has(task.id)) continue;
    known.add(task.id);
    pending.push({ id: task.id, dependsOn: task.dependsOn });
  }

  const ordered: string[] = [];
  const emitted = new Set<string>();
  let progressed = true;

  while (pending.length > 0 && progressed) {
    progressed = false;

    for (let index = 0; index < pending.length; index += 1) {
      const entry = pending[index];

      if (entry === undefined) continue;

      const ready = entry.dependsOn.every(
        (dependency) => dependency === entry.id || !known.has(dependency) || emitted.has(dependency)
      );

      if (!ready) continue;

      pending.splice(index, 1);
      ordered.push(entry.id);
      emitted.add(entry.id);
      progressed = true;
      break;
    }
  }

  for (const entry of pending) ordered.push(entry.id);

  return ordered;
}

export function renderTasksMarkdownFromArtifact(input: {
  readonly feature: ActiveFeature;
  readonly artifact: TaskGraphArtifact;
}): string {
  const graph = input.artifact;
  const order = topologicalTaskOrder(graph.tasks);
  const byId = new Map(graph.tasks.map((task) => [task.id, task]));
  const orderedTasks = order
    .map((id) => byId.get(id))
    .filter((task): task is Task => task !== undefined);
  const tasks = sections(
    orderedTasks.map(
      (task) =>
        `### ${task.id}: ${task.title}

Status:
${task.status}

Description:
${blockText(task.description)}

Requirements:
${bulletList(task.requirementIds)}

Acceptance Criteria:
${bulletList(task.acceptanceCriterionIds)}

Depends On:
${bulletList(task.dependsOn)}

Allowed Files:
${bulletList(task.allowedFiles)}

Expected Files:
${bulletList(task.expectedFiles)}

Forbidden Files:
${bulletList(task.forbiddenFiles)}

Validation Commands:
${bulletList(task.validationCommands)}

Parallelizable:
${yesNo(task.parallelizable)}

Task Class:
${task.taskClass ?? "unspecified"}

Risk Level:
${task.riskLevel}

Risk Factors:
${bulletList((task.riskFactors ?? []).map((factor) => factor.code))}`
    ),
    "None recorded."
  );
  const implementationOrder =
    order.length === 0 ? "- none" : order.map((id, index) => `${index + 1}. ${id}`).join("\n");
  const firstTaskId = order[0];
  const nextStep =
    firstTaskId === undefined
      ? `Add at least one task to \`${input.feature.relativePath}/task-graph.json\`, then run:

visp-kit tasks --validate`
      : `Run:

visp-kit context ${firstTaskId}

Note:
Run \`visp-kit context ${firstTaskId}\`, then use \`.visp/prompts/current-task.prompt.md\` with your agent to implement the selected task.`;

  return `# Task Graph: ${input.feature.intent.title}

## Feature

- ID: ${graph.featureId}
- Slug: ${graph.featureSlug ?? input.feature.slug}
- Status: ${graph.status ?? "unspecified"}

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

${tasks}

## Suggested Implementation Order

${implementationOrder}

## Next Step

${nextStep}
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
