# Visp Kit — Comprehensive Implementation Plan

**Product name:** `visp-kit`  
**CLI command:** `visp`  
**Tagline:** Small context. Clear specs. Accurate code.  
**Theme:** VispNote-inspired — simple, clean, lightweight, pastel accents, smooth flow/infinity feeling, calm productivity identity.  
**Primary target user:** Developers and engineering teams who want AI-assisted implementation to be accurate, traceable, and token-efficient.  
**Primary build agent:** Codex.  
**MVP language/runtime:** TypeScript on Node.js.

---

## 0. Codex Instruction Header

Codex should treat this document as the product and engineering source of truth for building `visp-kit`.

Build this project in phases. Do not attempt to implement the entire system in one large patch. For each phase:

1. Read the phase goal.
2. Implement only the files required for that phase.
3. Add or update tests.
4. Run the relevant validation commands.
5. Produce a short summary of what changed.
6. Do not introduce new production dependencies unless the phase explicitly allows it.
7. Prefer small modules and deterministic code over complex abstractions.

Important implementation rules:

- Keep the system simple first, powerful second.
- Prefer deterministic local tools over LLM calls.
- The MVP must not require an LLM API key.
- The MVP should generate artifacts, prompts, context packs, Codex skills, and workflow guidance.
- Codex itself will execute the coding work using the generated artifacts.
- The CLI should be useful even when no AI agent is active.
- Every feature/task must be traceable to requirements, acceptance criteria, and validation.
- Token efficiency is a first-class product requirement.

---

## 1. Product Vision

`visp-kit` is a lightweight spec-driven AI development kit. It improves on the general idea of spec-first development by adding:

- A strict but simple workflow from idea to verified implementation.
- Task-level context packs so AI agents see only the smallest useful context.
- Brownfield project scanning so existing codebases are understood before planning.
- Traceability from requirement → acceptance criterion → task → files → tests → validation result.
- Codex-friendly skills and `AGENTS.md` guidance.
- Budget modes for companies with limited token plans.
- A clean VispNote-style experience: calm, minimal, pastel, human-readable.

The product should feel simple:

```bash
visp init
visp feature "Add invoice PDF export"
visp next
visp context --next
visp verify
```

Internally, it should be structured and accurate:

```text
intent → clarify → spec → plan → task graph → context pack → implement → verify → review → reconcile
```

---

## 2. Core Design Principle

The central principle of `visp-kit` is:

> The AI should complete the smallest verified task using the smallest sufficient context, with every token grounded in a requirement, code evidence, test, or decision.

This means the system must avoid sending entire repositories, entire specs, and full histories to the model. It should compile small context packs per task.

---

## 3. What Makes Visp Kit Different

### 3.1 Compared to normal prompt-based AI development

Normal AI coding often works like this:

```text
User gives loose prompt → AI reads too much or too little → AI edits many files → user reviews manually
```

`visp-kit` should work like this:

```text
User gives feature idea
→ visp-kit creates structured requirement artifacts
→ visp-kit creates a task graph
→ visp-kit compiles the smallest context pack for the next task
→ Codex implements that task
→ visp-kit verifies, reviews, and reconciles the implementation
```

### 3.2 Compared to markdown-only spec workflows

`visp-kit` keeps human-friendly markdown, but also creates machine-readable JSON files for validation, automation, and token-efficient context compilation.

Example:

```text
.visp/features/001-invoice-pdf-export/spec.md      # human-readable
.visp/features/001-invoice-pdf-export/spec.json    # machine-readable
```

---

## 4. Product Goals

### 4.1 Functional goals

`visp-kit` must help users:

1. Initialize a project for spec-driven AI development.
2. Scan an existing codebase and build a reusable project index.
3. Define a project constitution.
4. Convert a feature idea into structured requirements.
5. Detect ambiguity and ask only useful blocking questions.
6. Generate implementation plans with evidence and constraints.
7. Generate dependency-aware task graphs.
8. Compile task-specific context packs.
9. Generate Codex skills and instructions.
10. Validate workflow artifacts before implementation.
11. Verify implementation using local commands.
12. Review diffs against task scope and requirements.
13. Detect spec-code drift after implementation.
14. Track token estimates and context size.
15. Produce PR summaries and release notes.

### 4.2 Non-functional goals

The product must be:

- Robust.
- Simple to start.
- Powerful for real engineering work.
- Token-efficient.
- Brownfield-friendly.
- Cross-platform where practical.
- Easy to use with Codex.
- Extensible without becoming heavy.
- Useful for JavaScript/TypeScript projects first, then generic projects later.

### 4.3 Non-goals for MVP

The MVP should not try to be:

- A full cloud service.
- A full web dashboard.
- A Jira replacement.
- A GitHub replacement.
- A general-purpose AI IDE.
- A full autonomous agent runtime.
- A built-in LLM provider router.
- A large multi-agent system that makes many automatic model calls.

---

## 5. Recommended Tech Stack

### 5.1 Runtime

Use:

```text
Node.js 20+
TypeScript
pnpm
```

Reason:

- Easy for JavaScript/TypeScript developers.
- Good CLI ecosystem.
- Good JSON/schema/tooling support.
- Good fit for the user's existing JavaScript/Electron background.
- Easier to maintain than a mixed-language tool for the MVP.

### 5.2 Recommended packages

Keep dependencies minimal.

Core dependencies:

```text
commander       CLI commands and options
zod             runtime schema validation
execa           running local commands safely
fast-glob       file discovery
picocolors      lightweight terminal colors
prompts         interactive prompts
fs-extra        safe filesystem helpers
ignore          .gitignore-style matching
```

Development dependencies:

```text
typescript
vitest
tsx
tsup
eslint
prettier
@types/node
```

Optional later dependencies:

```text
ts-morph        deeper TypeScript symbol analysis
simple-git      richer Git integration
chokidar        watch mode
```

Avoid heavy dependencies in the first version.

---

## 6. Repository Structure

Build as a single TypeScript package first. Do not start with a monorepo unless the project grows.

```text
visp-kit/
  AGENTS.md
  README.md
  package.json
  pnpm-lock.yaml
  tsconfig.json
  tsup.config.ts
  vitest.config.ts
  .gitignore
  .npmignore

  src/
    index.ts

    cli/
      main.ts
      commands/
        init.command.ts
        scan.command.ts
        constitution.command.ts
        feature.command.ts
        clarify.command.ts
        spec.command.ts
        plan.command.ts
        tasks.command.ts
        context.command.ts
        verify.command.ts
        review.command.ts
        reconcile.command.ts
        status.command.ts
        doctor.command.ts
        budget.command.ts
        next.command.ts
        pr.command.ts

    core/
      errors.ts
      result.ts
      logger.ts
      paths.ts
      file-system.ts
      git.ts
      command-runner.ts

    theme/
      palette.ts
      terminal.ts
      markdown.ts

    project/
      detect-project.ts
      project-profile.ts
      package-manager.ts
      config.ts

    artifacts/
      artifact-reader.ts
      artifact-writer.ts
      artifact-paths.ts
      schemas/
        project.schema.ts
        constitution.schema.ts
        feature.schema.ts
        requirement.schema.ts
        plan.schema.ts
        task.schema.ts
        context-pack.schema.ts
        verification.schema.ts
        traceability.schema.ts
        budget.schema.ts

    scanner/
      scan-project.ts
      scan-files.ts
      scan-package-json.ts
      scan-tests.ts
      scan-git.ts
      file-summary.ts
      module-map.ts
      cache.ts

    workflows/
      init.workflow.ts
      scan.workflow.ts
      constitution.workflow.ts
      feature.workflow.ts
      clarify.workflow.ts
      spec.workflow.ts
      plan.workflow.ts
      tasks.workflow.ts
      context.workflow.ts
      verify.workflow.ts
      review.workflow.ts
      reconcile.workflow.ts
      next.workflow.ts

    context/
      context-compiler.ts
      context-selector.ts
      token-estimator.ts
      evidence.ts
      prompt-pack-writer.ts

    budget/
      budget-mode.ts
      budget-report.ts
      budget-policy.ts

    validators/
      validate-artifacts.ts
      validate-traceability.ts
      validate-task-scope.ts
      validate-dependencies.ts
      validate-drift.ts

    templates/
      template-loader.ts
      markdown/
        constitution.template.md
        spec.template.md
        plan.template.md
        tasks.template.md
        context-pack.template.md
        verification.template.md
        pr-summary.template.md
      skills/
        visp-orchestrator.SKILL.md
        visp-clarify.SKILL.md
        visp-specify.SKILL.md
        visp-plan.SKILL.md
        visp-task-graph.SKILL.md
        visp-implement-task.SKILL.md
        visp-review-diff.SKILL.md
        visp-reconcile.SKILL.md
      agents/
        AGENTS.template.md

  tests/
    unit/
    integration/
    fixtures/
      js-basic-app/
      ts-react-app/
      node-api/
```

---

## 7. Target Project File Structure

When a user runs `visp init`, create this inside the target project:

```text
.visp/
  project.json
  config.json
  status.json

  memory/
    constitution.md
    constitution.compact.md
    project-summary.md
    patterns.md

  cache/
    file-index.json
    module-map.json
    test-map.json
    dependency-map.json
    file-summaries.json
    scan-meta.json

  features/
    001-example-feature/
      intent.md
      intent.json
      clarifications.md
      clarifications.json
      spec.md
      spec.json
      plan.md
      plan.json
      tasks.md
      task-graph.json
      traceability.md
      traceability.json
      context-packs/
        T001.context.md
        T001.context.json
      verification.md
      verification.json
      review.md
      reconcile.md

  prompts/
    current-task.prompt.md
    review-diff.prompt.md
    reconcile.prompt.md

  reports/
    budget-report.md
    scan-report.md
    doctor-report.md
```

If the user enables Codex integration, also create:

```text
AGENTS.md
.agents/
  skills/
    visp-orchestrator/
      SKILL.md
    visp-clarify/
      SKILL.md
    visp-specify/
      SKILL.md
    visp-plan/
      SKILL.md
    visp-task-graph/
      SKILL.md
    visp-implement-task/
      SKILL.md
    visp-review-diff/
      SKILL.md
    visp-reconcile/
      SKILL.md
```

Do not overwrite an existing `AGENTS.md` without confirmation. If one exists, append a clearly marked Visp Kit section or create `AGENTS.visp.md` and print instructions.

---

## 8. CLI Command Design

The CLI command should be `visp`.

### 8.1 Main commands

```bash
visp init [path]
visp scan
visp constitution
visp feature "<feature idea>"
visp clarify
visp spec
visp plan
visp tasks
visp context [taskId]
visp implement [taskId]
visp verify
visp review
visp reconcile
visp pr
visp status
visp next
visp doctor
visp budget
```

### 8.2 Important flags

```bash
--agent codex|generic|none
--budget lean|balanced|strict
--preset javascript|typescript|electron|react|node-api|generic
--changed
--dry-run
--json
--verbose
--force
--no-branch
--prompt-only
--diff-only
--targeted
```

### 8.3 Examples

Initialize a TypeScript project for Codex:

```bash
visp init --agent codex --preset typescript --budget lean
```

Scan project:

```bash
visp scan
```

Create a new feature:

```bash
visp feature "Add note pinning so pinned notes stay at the top"
```

Generate compact context for the next task:

```bash
visp context --next
```

Verify current feature:

```bash
visp verify --targeted
```

Review only the diff:

```bash
visp review --diff-only
```

---

## 9. Workflow State Machine

Use a simple state machine. Store state in:

```text
.visp/status.json
```

States:

```text
UNINITIALIZED
INITIALIZED
SCANNED
CONSTITUTION_READY
FEATURE_INTENT_READY
CLARIFICATION_READY
SPEC_READY
PLAN_READY
TASKS_READY
CONTEXT_READY
IMPLEMENTING
IMPLEMENTED
VERIFIED
REVIEWED
RECONCILED
READY_FOR_PR
```

The `visp next` command should read state and recommend the next command.

Example:

```text
Current feature: 001-note-pinning
Current state: PLAN_READY
Next command: visp tasks
Reason: task graph has not been created yet.
```

State transitions must be validated. For example, `visp tasks` should fail if there is no `plan.json`.

---

## 10. Artifact Schemas

Use Zod schemas in `src/artifacts/schemas/` and write JSON files from validated schemas.

### 10.1 Project profile

```ts
export type ProjectProfile = {
  name: string;
  rootPath: string;
  packageManager?: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
  languages: string[];
  frameworks: string[];
  testFrameworks: string[];
  buildCommands: string[];
  testCommands: string[];
  lintCommands: string[];
  typecheckCommands: string[];
  sourceRoots: string[];
  testRoots: string[];
  ignoredPaths: string[];
  createdAt: string;
  updatedAt: string;
};
```

### 10.2 Feature

```ts
export type Feature = {
  id: string;                 // 001
  slug: string;               // note-pinning
  title: string;              // Add note pinning
  status: FeatureStatus;
  budgetMode: 'lean' | 'balanced' | 'strict';
  riskLevel: 'low' | 'medium' | 'high';
  createdAt: string;
  updatedAt: string;
};
```

### 10.3 Requirement

```ts
export type Requirement = {
  id: string;                 // REQ-001
  featureId: string;
  title: string;
  description: string;
  source: 'user' | 'clarification' | 'derived';
  priority: 'must' | 'should' | 'could';
  acceptanceCriteria: AcceptanceCriterion[];
  assumptions: Assumption[];
  outOfScope: string[];
};

export type AcceptanceCriterion = {
  id: string;                 // AC-001
  requirementId: string;
  description: string;
  testable: boolean;
  validationMethod: 'unit' | 'integration' | 'e2e' | 'manual' | 'static';
};
```

### 10.4 Task

```ts
export type Task = {
  id: string;                 // T001
  title: string;
  description: string;
  requirementIds: string[];
  acceptanceCriterionIds: string[];
  dependsOn: string[];
  allowedFiles: string[];
  expectedFiles?: string[];
  forbiddenFiles?: string[];
  validationCommands: string[];
  status: 'pending' | 'ready' | 'in_progress' | 'blocked' | 'done' | 'verified';
  parallelizable: boolean;
  riskLevel: 'low' | 'medium' | 'high';
};
```

### 10.5 Context pack

```ts
export type ContextPack = {
  id: string;
  featureId: string;
  taskId: string;
  budgetMode: 'lean' | 'balanced' | 'strict';
  estimatedTokens: number;
  includedRequirements: string[];
  includedAcceptanceCriteria: string[];
  includedConstitutionRules: string[];
  includedFiles: ContextFile[];
  includedSnippets: ContextSnippet[];
  validationCommands: string[];
  constraints: string[];
  instructions: string[];
};

export type ContextFile = {
  path: string;
  reason: string;
  includeMode: 'summary' | 'snippet' | 'full';
  hash: string;
};
```

---

## 11. Budget Modes

Token efficiency must be built into the workflow.

### 11.1 Lean mode

Use for most company teams and routine work.

```text
Goal: Lowest practical token usage.
Max context pack estimate: 6,000 input tokens.
Max full files per task: 1.
Max included files per task: 6.
Clarification: blocking questions only.
Review: diff-only.
Security review: only for medium/high risk.
Output style: compact.
```

### 11.2 Balanced mode

Use for normal product features.

```text
Goal: Good accuracy with reasonable cost.
Max context pack estimate: 12,000 input tokens.
Max full files per task: 2.
Max included files per task: 10.
Clarification: blocking + important questions.
Review: diff + relevant requirement context.
Security review: risk-based.
Output style: moderate.
```

### 11.3 Strict mode

Use for auth, payment, database migration, cross-service integration, security-sensitive systems, and enterprise-critical flows.

```text
Goal: Maximum accuracy and auditability.
Max context pack estimate: 24,000 input tokens.
Max full files per task: 4.
Max included files per task: 16.
Clarification: full ambiguity scan.
Review: diff + contract + traceability + security.
Security review: always.
Output style: detailed.
```

---

## 12. Context Compiler

The context compiler is the most important component in `visp-kit`.

### 12.1 Purpose

It creates the smallest useful input for Codex to complete one task.

```bash
visp context T004
```

Creates:

```text
.visp/features/001-feature/context-packs/T004.context.md
.visp/features/001-feature/context-packs/T004.context.json
.visp/prompts/current-task.prompt.md
```

### 12.2 Context pack contents

Each context pack should include:

1. Current task.
2. Related requirements.
3. Related acceptance criteria.
4. Relevant constitution rules.
5. Existing code patterns.
6. Relevant file summaries.
7. Only necessary snippets or full files.
8. Allowed and forbidden files.
9. Validation commands.
10. Exact implementation instructions.
11. Output expectations.

### 12.3 Context selection algorithm

Implement this deterministic first:

```text
1. Read task graph.
2. Find selected task.
3. Include requirement and acceptance criterion IDs referenced by the task.
4. Include compact constitution rules relevant to the task.
5. Use allowedFiles as primary context candidates.
6. Search file index for keywords from feature title, task title, requirement titles, and expected file paths.
7. Include related test files if found.
8. Include summaries first.
9. Include snippets if summaries are insufficient.
10. Include full files only when budget allows.
11. Estimate tokens.
12. If over budget, reduce full files to snippets, then reduce snippets to summaries, then recommend task split.
```

### 12.4 Token estimation

Use a simple approximation:

```ts
estimatedTokens = Math.ceil(characterCount / 4);
```

This is not perfect, but it is good enough for budget control.

### 12.5 Context pack markdown template

```md
# Visp Context Pack: {{taskId}}

## Feature
{{featureTitle}}

## Task
{{taskTitle}}

## Requirements
{{requirements}}

## Acceptance Criteria
{{acceptanceCriteria}}

## Relevant Constitution Rules
{{constitutionRules}}

## Existing Patterns
{{patterns}}

## Allowed Files
{{allowedFiles}}

## Forbidden Files
{{forbiddenFiles}}

## Relevant Files and Snippets
{{filesAndSnippets}}

## Validation Commands
{{validationCommands}}

## Implementation Instructions
- Implement only this task.
- Do not perform unrelated refactoring.
- Do not add dependencies unless explicitly allowed.
- Keep changes small and testable.
- Update tests required for the acceptance criteria.
- After implementation, run the validation commands.
```

---

## 13. Codebase Scanner

The scanner should reduce repeated token usage by creating a reusable project index.

### 13.1 Command

```bash
visp scan
visp scan --changed
```

### 13.2 Scanner responsibilities

The scanner should detect:

- Package manager.
- Main language.
- Frameworks.
- Source roots.
- Test roots.
- Build commands.
- Test commands.
- Lint commands.
- Typecheck commands.
- Important config files.
- Git status.
- File summaries.
- Module map.
- Test map.
- Dependency map.

### 13.3 First MVP scanning logic

For MVP, do not use AI to summarize files. Use deterministic summaries.

For each source file, store:

```text
path
hash
extension
size
exports if easy to detect
imports if easy to detect
function/class names if easy to detect
first meaningful comments if available
```

For JavaScript/TypeScript files, use simple regex-based extraction first. Later, improve with AST parsing.

### 13.4 Cache invalidation

Use file hash.

```ts
export type FileSummary = {
  path: string;
  hash: string;
  language: string;
  sizeBytes: number;
  imports: string[];
  exports: string[];
  symbols: string[];
  summary: string;
  updatedAt: string;
};
```

If the hash has not changed, reuse the summary.

---

## 14. Constitution System

The constitution defines project principles.

### 14.1 Command

```bash
visp constitution --preset typescript
```

### 14.2 Files

```text
.visp/memory/constitution.md
.visp/memory/constitution.compact.md
```

### 14.3 Compact constitution format

```text
C001: Keep functions small and specific.
C002: Follow existing module boundaries.
C003: Do not introduce new dependencies without approval.
C004: Write tests for behavior changes.
C005: Keep UI, domain, persistence, and infrastructure concerns separate.
C006: Avoid unrelated refactoring.
C007: Prefer deterministic validation over manual assumptions.
C008: Every task must map to at least one requirement or acceptance criterion.
```

The full constitution can be more descriptive. The compact version is used in context packs to reduce token usage.

---

## 15. Feature Workflow

### 15.1 Command

```bash
visp feature "Add note pinning"
```

### 15.2 Responsibilities

This command should:

1. Determine next feature number.
2. Create a slug from the title.
3. Create feature directory.
4. Create `intent.md` and `intent.json`.
5. Set feature state to `FEATURE_INTENT_READY`.
6. Optionally create a Git branch.

### 15.3 Directory example

```text
.visp/features/001-note-pinning/
  intent.md
  intent.json
```

### 15.4 Intent format

```md
# Feature Intent: Add note pinning

## User Request
Add note pinning so pinned notes stay at the top.

## Initial Interpretation
Users need a way to mark important notes as pinned and see them before non-pinned notes.

## Known Constraints
- Follow existing project architecture.
- Keep implementation minimal.
- Use current note list behavior where possible.

## Unknowns
- Should pinning apply globally or only within current filters?
- Should pinned order be manually sortable or based on updated date?
```

---

## 16. Clarification Workflow

### 16.1 Command

```bash
visp clarify
```

### 16.2 Lean mode behavior

Ask only blocking questions.

Example:

```text
Q1. Should pinned notes appear above all notes globally, or only within the current filter/search result?
Recommended default: Within the current filter/search result.
Reason: This preserves existing filtering behavior and avoids surprising users.
```

### 16.3 Output

```text
clarifications.md
clarifications.json
```

### 16.4 Blocking rules

A question is blocking only if a wrong assumption would cause:

- Incorrect business behavior.
- Security issue.
- Data model change.
- API contract mismatch.
- Migration risk.
- Rework across multiple modules.

Do not ask cosmetic questions unless the task is explicitly UI/brand-focused.

---

## 17. Specification Workflow

### 17.1 Command

```bash
visp spec
```

### 17.2 Spec sections

Generate:

```text
Functional requirements
Acceptance criteria
User stories
Business rules
Out-of-scope items
Assumptions
Edge cases
Non-functional requirements
Traceability seed
```

### 17.3 Spec rules

The spec describes what and why, not how.

Bad:

```text
Add a boolean pinned column in SQLite.
```

Good:

```text
Users can mark a note as pinned so it appears before non-pinned notes in the note list.
```

Implementation details belong in the plan.

---

## 18. Planning Workflow

### 18.1 Command

```bash
visp plan
```

### 18.2 Plan sections

Generate:

```text
Architecture summary
Affected modules
Implementation approach
Data model impact
API impact
UI impact
Security impact
Performance impact
Testing strategy
Rollback strategy
Alternatives considered
Dependencies
Risk assessment
```

### 18.3 Evidence requirement

The plan must distinguish:

```text
Known from codebase
Known from user
Known from constitution
Inferred
Assumed
Unknown
```

Example:

```text
Known from codebase:
- Existing note list sorting is handled in src/features/notes/note-list.tsx.

Assumption:
- Pinning should use existing note update flow.

Needs confirmation:
- Whether pinned notes should be sortable manually.
```

---

## 19. Task Graph Workflow

### 19.1 Command

```bash
visp tasks
```

### 19.2 Task generation rules

Tasks must be:

- Small.
- Ordered.
- Dependency-aware.
- Linked to requirement IDs.
- Linked to acceptance criteria IDs.
- Clear about allowed files.
- Clear about validation commands.
- Safe for Codex to implement one at a time.

### 19.3 Example task graph

```text
T001: Add failing tests for note pinning behavior
Depends on: none
Requirements: REQ-001
Acceptance Criteria: AC-001, AC-002
Allowed files:
- src/features/notes/note-list.test.ts
Validation:
- pnpm test note-list

T002: Add pinned property handling in note model/repository
Depends on: T001
Requirements: REQ-001
Acceptance Criteria: AC-001
Allowed files:
- src/features/notes/note.ts
- src/features/notes/note-repository.ts
- src/features/notes/note-repository.test.ts
Validation:
- pnpm test note-repository

T003: Update note list sorting to show pinned notes first
Depends on: T002
Requirements: REQ-001
Acceptance Criteria: AC-001, AC-002
Allowed files:
- src/features/notes/note-list.tsx
- src/features/notes/note-list.test.ts
Validation:
- pnpm test note-list
```

---

## 20. Implementation Workflow

### 20.1 Command

```bash
visp implement --next
```

### 20.2 MVP behavior

For MVP, `visp implement` should not call an LLM by itself. It should:

1. Select the next ready task.
2. Compile a context pack.
3. Write `.visp/prompts/current-task.prompt.md`.
4. Print clear instructions for Codex.

Example output:

```text
Context pack created for T003.
Prompt written to .visp/prompts/current-task.prompt.md

Next Codex action:
Use the visp-implement-task skill and implement only T003.
```

When Codex is active, the skill can read the context pack and implement the task.

### 20.3 Implementation rules for Codex

Codex must:

- Implement one task at a time.
- Read the generated context pack first.
- Touch only allowed files unless it asks for confirmation.
- Write or update tests first when the task requires behavior change.
- Avoid broad refactoring.
- Avoid new dependencies unless explicitly allowed.
- Run validation commands.
- Report failures with concise error context.

---

## 21. Verification Workflow

### 21.1 Command

```bash
visp verify
visp verify --targeted
```

### 21.2 Verification checks

Run:

- Task validation commands.
- Project test command if configured.
- Typecheck command if configured.
- Lint command if configured.
- Artifact validation.
- Traceability validation.
- Task scope validation.
- Dependency change validation.

### 21.3 Verification output

```text
.visp/features/001-feature/verification.md
.visp/features/001-feature/verification.json
```

Example:

```text
Verification summary
Feature: 001-note-pinning
Status: passed
Tasks verified: 3/3
Requirements covered: 2/2
Acceptance criteria covered: 4/4
Tests: passed
Lint: passed
Typecheck: passed
Scope violations: none
Dependency changes: none
```

---

## 22. Review Workflow

### 22.1 Command

```bash
visp review --diff-only
```

### 22.2 Review input

Use only:

- Git diff.
- Current task context.
- Requirement IDs.
- Acceptance criteria IDs.
- Allowed files.
- Validation output.

Do not include the whole repo.

### 22.3 Review checks

Check:

- Did implementation satisfy the task?
- Did it modify forbidden files?
- Did it add dependencies?
- Did it change behavior outside the spec?
- Did it skip tests?
- Did it violate constitution rules?
- Did it introduce security or data risks?

---

## 23. Reconciliation Workflow

### 23.1 Command

```bash
visp reconcile
```

### 23.2 Purpose

After implementation, compare:

```text
spec → plan → tasks → actual diff → verification results
```

### 23.3 Outcomes

The result should be one of:

```text
RECONCILED
SPEC_UPDATE_REQUIRED
PLAN_UPDATE_REQUIRED
FOLLOW_UP_TASK_REQUIRED
IMPLEMENTATION_FIX_REQUIRED
```

### 23.4 Example

```text
Finding:
Implementation added keyboard shortcut Ctrl+P for pinning, but this behavior was not in the spec.

Recommendation:
Create follow-up requirement or remove shortcut.
```

---

## 24. Traceability System

Every feature should produce:

```text
traceability.md
traceability.json
```

### 24.1 Traceability matrix

```text
Requirement | Acceptance Criteria | Tasks | Files | Tests | Status
REQ-001     | AC-001, AC-002      | T001  | ...   | ...   | Passed
REQ-002     | AC-003              | T002  | ...   | ...   | Passed
```

### 24.2 Validation rules

Fail validation if:

- A requirement has no acceptance criteria.
- An acceptance criterion has no task.
- A task has no requirement ID.
- A task has no validation command and no explanation.
- A changed file is not linked to a task.

---

## 25. Codex Integration

Codex support is a major part of this product.

### 25.1 AGENTS.md generation

Generate a root `AGENTS.md` with this section:

```md
# Visp Kit Agent Instructions

This repository uses Visp Kit for spec-driven, token-efficient AI development.

Before implementing a feature:

1. Run `visp status`.
2. Read the active feature under `.visp/features/`.
3. Use `visp context --next` to generate the smallest task context.
4. Implement only the selected task.
5. Follow allowed files and validation commands.
6. Run `visp verify --targeted` after implementation.
7. Run `visp review --diff-only` before summarizing.

Never implement from a loose prompt when a Visp context pack exists.
Never modify files outside the task scope without asking.
Never add dependencies unless the plan explicitly allows it.
```

### 25.2 Skills to generate

Generate these Codex skills:

```text
visp-orchestrator
visp-clarify
visp-specify
visp-plan
visp-task-graph
visp-implement-task
visp-review-diff
visp-reconcile
```

### 25.3 Skill format

Each skill should be a directory with `SKILL.md`:

```text
.agents/skills/visp-implement-task/SKILL.md
```

### 25.4 Example skill: visp-implement-task

```md
---
name: visp-implement-task
description: Use when implementing a Visp Kit task from a generated context pack. Implement only the current task, respect allowed files, and run validation commands.
---

# Visp Implement Task Skill

Use this skill when the user asks to implement a Visp Kit task or when `.visp/prompts/current-task.prompt.md` exists.

## Steps

1. Run `visp status` to identify the active feature and task.
2. Run `visp context --next` unless a current context pack already exists.
3. Read `.visp/prompts/current-task.prompt.md`.
4. Read the referenced context pack.
5. Implement only the selected task.
6. Touch only allowed files unless a required change is impossible without another file.
7. Write or update tests first when practical.
8. Run the validation commands from the context pack.
9. Run `visp verify --targeted`.
10. Summarize changed files, validation result, and any follow-up needed.

## Hard rules

- Do not perform unrelated refactoring.
- Do not add dependencies unless explicitly allowed.
- Do not silently expand scope.
- Do not ignore failed validation.
- Do not continue to the next task unless explicitly requested.
```

---

## 26. Theme and UX Design

The product should carry the VispNote identity: clean, simple, pastel, lightweight, and calm.

### 26.1 Visual direction

Use:

```text
Minimal terminal output
Soft pastel status labels
Lightweight markdown docs
No noisy ASCII art
No heavy branding
Subtle infinity/flow motif
```

### 26.2 Suggested palette

```ts
export const palette = {
  ink: '#1F2937',
  muted: '#6B7280',
  surface: '#FFFFFF',
  surfaceSoft: '#FBFBFF',
  sky: '#BFD7FF',
  lavender: '#D7C7FF',
  rose: '#FFD0DC',
  mint: '#BDEAD7',
  amber: '#FFE6B3',
  success: '#7DD6B4',
  warning: '#F6D58A',
  danger: '#F3A6B5',
};
```

### 26.3 Terminal style

Example:

```text
∞ Visp Kit
Feature: 001-note-pinning
State: PLAN_READY
Next: visp tasks
```

Status labels:

```text
[ready]
[needs-clarification]
[verified]
[drift-detected]
[over-budget]
```

### 26.4 Markdown document style

Generated markdown should be readable and calm:

```md
# 001 — Note Pinning

## Intent

## Requirements

## Acceptance Criteria

## Plan

## Tasks

## Verification
```

Avoid overly decorative markdown.

---

## 27. Accuracy Gates

### 27.1 Pre-plan gates

Before planning:

- Feature intent exists.
- Blocking clarifications are resolved or defaulted explicitly.
- Requirements are testable.
- Out-of-scope items are listed.

### 27.2 Pre-implementation gates

Before implementation:

- Plan exists.
- Task graph exists.
- Each task has requirement IDs.
- Each task has validation commands or explanation.
- Context pack is within budget or the task is split.

### 27.3 Post-implementation gates

After implementation:

- Validation commands pass or failures are recorded.
- Scope violations are checked.
- Dependency changes are checked.
- Traceability matrix is updated.
- Reconciliation is completed.

---

## 28. Risk-Based Workflow Routing

Classify features before planning.

### 28.1 Low risk

Examples:

- UI text changes.
- Simple filters.
- Documentation updates.
- Small visual changes.

Workflow:

```text
intent → spec-lite → tasks → context → implement → targeted verify
```

### 28.2 Medium risk

Examples:

- New API endpoint.
- New business rule.
- New local data behavior.
- New integration inside existing module.

Workflow:

```text
intent → clarify → spec → plan → tasks → context → implement → verify → review
```

### 28.3 High risk

Examples:

- Authentication.
- Authorization.
- Payment.
- Data migration.
- Cross-service integration.
- Security-sensitive behavior.

Workflow:

```text
intent → clarify → spec → contracts → risk review → plan → tasks → context → implement → verify → security review → reconcile
```

MVP can implement risk classification using simple keywords and user flags.

---

## 29. Validation Commands

### 29.1 `visp doctor`

Checks:

- `.visp` folder exists.
- Config is valid.
- Required files exist.
- Codex skills exist if enabled.
- Package manager is detected.
- Test/build commands are configured.
- Git repository is detected.
- No corrupted JSON artifacts.

### 29.2 `visp status`

Shows:

- Project name.
- Active feature.
- Current state.
- Next recommended command.
- Budget mode.
- Last verification status.
- Warnings.

### 29.3 `visp budget`

Shows:

- Estimated tokens by context pack.
- Largest context files.
- Cache hit rate.
- Over-budget tasks.
- Recommendations.

Example:

```text
Budget report
Mode: lean
Current task: T003
Estimated context: 5,420 tokens
Limit: 6,000 tokens
Status: OK
Largest included file: src/features/notes/note-list.tsx
Recommendation: none
```

---

## 30. Project Presets

MVP presets:

```text
generic
javascript
typescript
react
node-api
electron
```

### 30.1 TypeScript preset

Constitution rules:

```text
- Use TypeScript strict mode where possible.
- Prefer small pure functions.
- Avoid `any` unless justified.
- Keep IO at boundaries.
- Add tests for behavior changes.
- Run typecheck before marking a task verified.
```

### 30.2 Electron preset

Constitution rules:

```text
- Keep main, preload, and renderer responsibilities separate.
- Do not expose unsafe APIs through preload.
- Avoid mixing UI logic with persistence logic.
- Prefer local-first behavior.
- Test core logic outside Electron shell where possible.
```

### 30.3 Node API preset

Constitution rules:

```text
- Keep controllers thin.
- Put business logic in services/use cases.
- Validate inputs at boundaries.
- Keep persistence isolated.
- Add integration tests for API behavior.
```

---

## 31. Implementation Phases for Codex

Codex should build `visp-kit` in these phases.

---

### Phase 0 — Project bootstrap

Goal: Create the basic TypeScript CLI project.

Tasks:

1. Create `package.json`.
2. Configure TypeScript.
3. Configure Vitest.
4. Configure tsup build.
5. Add `src/index.ts` and `src/cli/main.ts`.
6. Add basic `visp --help` command.
7. Add README skeleton.
8. Add root `AGENTS.md` for building this repository.

Acceptance criteria:

- `pnpm install` works.
- `pnpm build` works.
- `pnpm test` works.
- `node dist/index.js --help` prints CLI help.

---

### Phase 1 — Core utilities and theme

Goal: Add shared utilities and Visp-style terminal output.

Tasks:

1. Implement `core/errors.ts`.
2. Implement `core/result.ts`.
3. Implement `core/file-system.ts`.
4. Implement `core/paths.ts`.
5. Implement `core/command-runner.ts`.
6. Implement `theme/palette.ts`.
7. Implement `theme/terminal.ts`.
8. Add tests for path and filesystem helpers.

Acceptance criteria:

- Common utilities are tested.
- Terminal output uses a minimal Visp style.
- No business workflow logic is mixed into utility files.

---

### Phase 2 — Artifact schemas

Goal: Define validated machine-readable artifacts.

Tasks:

1. Add Zod schemas for project config.
2. Add Zod schemas for feature, requirements, plan, tasks, context pack, verification, traceability, and budget.
3. Implement artifact reader/writer.
4. Add validation error formatting.
5. Add tests for valid and invalid artifacts.

Acceptance criteria:

- Invalid artifact JSON fails with clear error messages.
- Artifact writer creates formatted JSON.
- Artifact reader validates before returning data.

---

### Phase 3 — `visp init`

Goal: Initialize a target repository.

Tasks:

1. Implement `init.command.ts`.
2. Implement `init.workflow.ts`.
3. Create `.visp` folder structure.
4. Write default `project.json`, `config.json`, and `status.json`.
5. Write default constitution templates.
6. Support flags: `--agent`, `--budget`, `--preset`.
7. If `--agent codex`, generate `AGENTS.md` and `.agents/skills`.
8. Add integration tests using a temporary directory.

Acceptance criteria:

- `visp init --agent codex --preset typescript --budget lean` creates the expected files.
- Existing files are not overwritten without `--force`.
- The command works in an empty temp project.

---

### Phase 4 — `visp scan`

Goal: Scan existing project structure and cache reusable summaries.

Tasks:

1. Detect package manager.
2. Read `package.json` if present.
3. Detect languages and frameworks.
4. Detect test/build/lint/typecheck commands.
5. Build file index with hashes.
6. Extract simple imports/exports/symbols for JS/TS.
7. Generate `project-summary.md`.
8. Generate `file-index.json`, `file-summaries.json`, `test-map.json`, and `scan-report.md`.
9. Support `--changed` using file hashes.
10. Add fixture-based tests.

Acceptance criteria:

- Scanner works on fixture JS/TS projects.
- Re-running scan reuses unchanged file summaries.
- `scan-report.md` is human-readable.

---

### Phase 5 — `visp constitution`

Goal: Generate and manage project constitution.

Tasks:

1. Implement constitution command.
2. Support presets.
3. Generate full and compact constitution.
4. Validate compact rules have IDs.
5. Add tests.

Acceptance criteria:

- `constitution.md` and `constitution.compact.md` are generated.
- Preset rules are included.
- Compact constitution can be used by context compiler.

---

### Phase 6 — `visp feature`

Goal: Create a new feature workspace.

Tasks:

1. Determine next feature number.
2. Slugify feature title.
3. Create feature directory.
4. Write `intent.md` and `intent.json`.
5. Update active feature in `status.json`.
6. Optionally create Git branch unless `--no-branch`.
7. Add tests.

Acceptance criteria:

- Multiple features get correct IDs.
- Feature folders are stable and predictable.
- Active feature is updated.

---

### Phase 7 — Spec, clarify, plan, and tasks templates

Goal: Generate structured artifacts and prompt packs without requiring built-in LLM calls.

Tasks:

1. Implement `visp clarify` to generate clarification prompt/artifact templates.
2. Implement `visp spec` to generate spec template from intent and clarifications.
3. Implement `visp plan` to generate plan template from spec and project profile.
4. Implement `visp tasks` to generate task graph template.
5. Add commands to validate these artifacts after Codex edits them.
6. Add tests for generated markdown and JSON shape.

Important: In MVP, these commands may create draft templates and Codex prompts. Codex can fill them. Later, optional LLM provider adapters can auto-fill them.

Acceptance criteria:

- Each command creates the expected files.
- Missing prerequisites produce clear errors.
- JSON artifacts validate.

---

### Phase 8 — Context compiler and token budget

Goal: Build the efficiency layer.

Tasks:

1. Implement token estimator.
2. Implement budget mode config.
3. Implement context selector.
4. Implement context compiler.
5. Generate context markdown and JSON.
6. Generate `.visp/prompts/current-task.prompt.md`.
7. Add `visp budget` command.
8. Add over-budget warnings.
9. Add tests using fixture tasks and files.

Acceptance criteria:

- Context packs include only relevant information.
- Token estimates are shown.
- Lean/balanced/strict modes change context limits.
- Over-budget context recommends task split.

---

### Phase 9 — Verification and validation

Goal: Add deterministic quality gates.

Tasks:

1. Implement `visp verify`.
2. Run configured validation commands.
3. Validate artifacts.
4. Validate traceability.
5. Validate task scope against git diff.
6. Validate dependency changes.
7. Generate verification report.
8. Add tests with fake command runner.

Acceptance criteria:

- Passing validation produces report.
- Failing validation records command, exit code, and useful output.
- Scope violations are detected.

---

### Phase 10 — Review and reconcile

Goal: Compare implementation against spec, plan, and task scope.

Tasks:

1. Implement `visp review --diff-only`.
2. Generate review prompt using diff + context.
3. Implement deterministic checks for modified files.
4. Implement `visp reconcile`.
5. Compare changed files to tasks and requirements.
6. Generate reconciliation report.
7. Add tests.

Acceptance criteria:

- Review prompt does not include the whole repo.
- Reconcile detects changed files without task mapping.
- Reports are readable and actionable.

---

### Phase 11 — `visp next`, `visp status`, `visp doctor`, `visp pr`

Goal: Make the CLI easy and practical.

Tasks:

1. Implement state-based next command.
2. Implement status summary.
3. Implement doctor checks.
4. Implement PR summary generation.
5. Add tests.

Acceptance criteria:

- User can run `visp next` and know what to do.
- `visp doctor` catches missing/corrupt setup.
- `visp pr` creates a concise PR summary from artifacts.

---

### Phase 12 — Documentation and release polish

Goal: Prepare for public use.

Tasks:

1. Complete README.
2. Add quickstart.
3. Add command reference.
4. Add example workflow.
5. Add troubleshooting guide.
6. Add contribution guide.
7. Add npm package metadata.
8. Add release checklist.

Acceptance criteria:

- A new user can initialize and use the kit from README alone.
- Documentation is clean and VispNote-themed.
- Package can be built and packed with `pnpm pack`.

---

## 32. Testing Strategy

### 32.1 Unit tests

Test:

- Schemas.
- Path helpers.
- Token estimator.
- Context selector.
- Budget rules.
- Slug generation.
- Feature ID generation.
- File hash logic.

### 32.2 Integration tests

Use temporary directories and fixture projects.

Test:

- `visp init`.
- `visp scan`.
- `visp feature`.
- `visp context`.
- `visp verify` with fake commands.

### 32.3 Golden file tests

Use snapshots or golden files for:

- Generated `AGENTS.md`.
- Generated skill files.
- Generated context packs.
- Generated markdown templates.

### 32.4 Manual test workflow

After MVP:

```bash
pnpm build
pnpm link --global
mkdir /tmp/visp-demo
cd /tmp/visp-demo
pnpm init
visp init --agent codex --preset typescript --budget lean
visp scan
visp feature "Add todo categories"
visp next
```

---

## 33. Coding Standards for Visp Kit Itself

Codex must follow these while building `visp-kit`:

- Keep files small and focused.
- Prefer pure functions in core logic.
- Keep CLI parsing separate from workflow logic.
- Keep filesystem writes centralized.
- Validate external input with Zod.
- Do not hide errors.
- Avoid global mutable state.
- Avoid long classes.
- Prefer explicit types.
- Use dependency injection for command runner in tests.
- Do not introduce dependencies casually.
- Each command must have at least one test or integration test.

Suggested file size guideline:

```text
Prefer < 250 lines per file.
Avoid > 400 lines unless there is a clear reason.
```

---

## 34. README Structure

The README should contain:

```md
# Visp Kit

Small context. Clear specs. Accurate code.

## What is Visp Kit?
## Why use it?
## Quick start
## Core workflow
## Token-efficient mode
## Codex integration
## Commands
## Example: Add a feature
## Project structure
## Budget modes
## Troubleshooting
## Roadmap
```

---

## 35. Example User Flow

```bash
# Install once
npm install -g visp-kit

# Inside an existing project
visp init --agent codex --preset typescript --budget lean
visp scan
visp constitution --preset typescript

# Start a feature
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks

# Work task by task
visp context --next
visp implement --next

# After Codex implements the task
visp verify --targeted
visp review --diff-only
visp reconcile
visp pr
```

---

## 36. First Codex Prompt to Build This Project

Use this prompt after creating a new repository for `visp-kit`:

```text
You are Codex. Build the Visp Kit project using the implementation plan in `visp-kit-implementation-plan.md`.

Start with Phase 0 only.

Rules:
- Do not implement later phases yet.
- Use TypeScript, Node.js 20+, pnpm, commander, zod, vitest, and tsup.
- Keep the CLI skeleton simple.
- Add tests where possible.
- Create a clean README skeleton.
- Keep files small.
- After implementation, run pnpm build and pnpm test.
- Summarize what changed and what phase should be implemented next.
```

Then continue phase by phase:

```text
Continue with Phase 1 only. Follow the implementation plan. Do not implement later phases yet.
```

---

## 37. Future Roadmap

After MVP, consider:

1. MCP server support.
2. Optional LLM provider adapters.
3. Local embedding retrieval.
4. GitHub Issues sync.
5. Jira sync.
6. CODEOWNERS review routing.
7. CI integration.
8. Web dashboard.
9. Team-level budget reports.
10. Organization policy packs.
11. Security/compliance packs.
12. Packageable Codex plugin distribution.

---

## 38. Release Plan

### 38.1 Package name

Preferred npm package:

```text
visp-kit
```

CLI binary:

```text
visp
```

Alternative scoped package if needed:

```text
@visp/kit
```

### 38.2 Versioning

Start with:

```text
0.1.0
```

### 38.3 MVP release checklist

```text
[ ] CLI builds
[ ] CLI help works
[ ] init works
[ ] scan works
[ ] feature works
[ ] context pack works
[ ] Codex skills generated
[ ] verify works
[ ] status/next/doctor work
[ ] README complete
[ ] tests pass
[ ] package packs successfully
```

---

## 39. External Reference Basis

These references informed the design direction:

- GitHub Spec Kit repository and documentation: https://github.com/github/spec-kit
- Spec Kit quickstart: https://github.github.com/spec-kit/quickstart.html
- Spec Kit spec-driven development notes: https://github.com/github/spec-kit/blob/main/spec-driven.md
- OpenAI Codex skills documentation: https://developers.openai.com/codex/skills
- OpenAI Codex AGENTS.md documentation: https://developers.openai.com/codex/guides/agents-md
- OpenAI Codex repository: https://github.com/openai/codex

---

## 40. Final Build Direction

Build `visp-kit` as a calm, practical, token-efficient implementation companion for AI coding agents.

The MVP should not try to automate everything. It should create the right structure so Codex can implement accurately:

```text
clear requirements
+ small tasks
+ compact context
+ strict validation
+ traceability
= better AI implementation with lower token cost
```

That is the core of Visp Kit.
