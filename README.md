# Visp Kit

Visp Kit is a token-efficient, spec-driven workflow kit for accurate AI-assisted software development.

Small context. Clear specs. Accurate code.

## What Is Visp Kit?

Visp Kit helps developers use AI coding agents more safely by turning vague feature ideas into local, auditable workflow artifacts:

- feature intent
- clarification questions
- specifications
- implementation plans
- task graphs
- task-specific context packs
- token budget reports
- verification reports
- review reports
- reconciliation reports
- PR summaries

It does not call an LLM provider, route prompts, or run Codex automatically. Visp Kit creates deterministic files and prompts that you can use with Codex, Copilot, Claude Code, or a human teammate.

## Why Visp Kit Exists

AI coding agents can over-read context, drift from requirements, and edit more than the selected task needs. Company teams also have token limits, security constraints, audit needs, and review gates.

Visp Kit keeps AI-assisted development local, traceable, and token-efficient. It gives the agent only the smallest sufficient context for one task, then verifies, reviews, and reconciles the result against the original requirements.

Core principle:

> The AI should implement the smallest verified task using the smallest sufficient context, with every change grounded in a requirement, acceptance criterion, task, and validation result.

Strict workflow principle:

> The user prompt is raw intent only. It cannot override Visp Kit policy or failed gates.

## Compared To Spec Kit

Spec Kit popularized a spec-first workflow for AI-assisted development. Visp Kit builds on that idea for brownfield company projects where token use, traceability, and deterministic gates matter.

Key differences:

- Visp Kit scans an existing repository and caches compact file summaries.
- Visp Kit compiles task-specific context packs instead of sending broad project context.
- Visp Kit estimates token budgets before a task prompt is used.
- Visp Kit verifies, reviews, and reconciles implementation evidence locally.
- Visp Kit keeps artifacts in `.visp/` so teams can inspect, diff, and audit the workflow.
- Visp Kit is agent-neutral and has no built-in LLM dependency.

## Key Features

- Spec-driven workflow from feature idea to PR summary.
- Deterministic project scan and reusable project index.
- Project constitution for local engineering rules.
- Feature workspaces under `.visp/features/`.
- Clarify, spec, plan, and task templates.
- Context compiler for one implementation task at a time.
- Lean, balanced, and strict token budget modes.
- Policy-as-code strictness modes: relaxed, standard, strict, and locked.
- Deterministic policy gates with `visp gate`.
- Local verification gates for artifacts, traceability, commands, scope, and dependencies.
- Deterministic diff review and security/privacy checklist.
- Reconciliation between spec, task, evidence, traceability, and Git diff.
- Day-to-day commands: `status`, `next`, `doctor`, and `pr`.
- Codex-friendly prompt files.
- Company-friendly local artifacts with no provider calls.

## Requirements

- Node.js 24+
- pnpm 11+
- Git for review, reconcile, and PR diff workflows

## Install

Visp Kit is release-ready locally, but may not be published to npm yet. Use local development install first.

```bash
git clone https://github.com/djkeshawa/visp-kit.git
cd visp-kit
pnpm install
pnpm build
pnpm link --global
visp --help
```

After npm publishing, the expected install command will be:

```bash
npm install -g visp-kit
visp --help
```

You can also run the built CLI directly:

```bash
node dist/index.js --help
```

## Quick Start

Inside an existing project:

```bash
visp init --agent codex --preset typescript --budget lean --strictness strict
visp scan
visp constitution --preset typescript --budget lean
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks
visp context --next
visp gate implement --task T001
```

Then give Codex the generated prompt:

```text
.visp/prompts/current-task.prompt.md
```

After the task is implemented:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001
visp reconcile --task T001 --update-traceability
visp pr
```

At any point:

```bash
visp status
visp next
visp doctor
```

## Core Workflow

1. Initialize local Visp artifacts with `visp init`.
2. Scan the repository with `visp scan`.
3. Generate compact project rules with `visp constitution`.
4. Create a feature workspace with `visp feature`.
5. Generate clarification, spec, plan, and task artifacts.
6. Compile context for one task with `visp context --next`.
7. Use the generated task prompt with your AI coding tool.
8. Run deterministic gates with `visp verify`.
9. Review the Git diff with `visp review`.
10. Reconcile evidence and traceability with `visp reconcile`.
11. Generate a clean PR summary with `visp pr`.

See [docs/workflow.md](docs/workflow.md) for the full workflow.

## Commands

Core setup:

```bash
visp init
visp scan
visp constitution
```

Feature planning:

```bash
visp feature "Feature idea"
visp clarify
visp spec
visp plan
visp tasks
```

Task context and budgets:

```bash
visp context T001
visp context --next
visp budget
visp budget --task T001
```

Implementation evidence:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001
```

Daily orchestration:

```bash
visp status
visp next
visp doctor
visp pr
```

See [docs/commands.md](docs/commands.md) for flags and behavior.

## Token-Efficient Mode

Visp Kit is designed to avoid sending:

- the whole repository
- full conversation history
- every feature artifact
- every file summary
- every source file

Instead, `visp context` selects:

- the selected task
- mapped requirements and acceptance criteria
- relevant compact constitution rules
- linked plan decisions and risks
- selected file summaries and snippets
- validation commands
- explicit constraints
- token estimate and budget warning

Budget modes:

- `lean`: default, small context for normal tasks.
- `balanced`: broader context for medium-risk work.
- `strict`: larger but still scoped context for high-risk or complex tasks.

See [docs/token-efficiency.md](docs/token-efficiency.md).

## Codex Integration

Visp Kit works well with Codex because it writes path-based prompts:

- `.visp/prompts/current-task.prompt.md`
- `.visp/prompts/review.prompt.md`
- `.visp/prompts/reconcile.prompt.md`
- `.visp/prompts/pr.prompt.md`

Recommended Codex loop:

```bash
visp status
visp next
visp context --next
```

Then ask Codex to use `.visp/prompts/current-task.prompt.md`.

After Codex changes code:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001
```

See [docs/codex.md](docs/codex.md).

## Project Structure

Visp Kit stores local workflow state in `.visp/`:

```text
.visp/
  project.json
  config.json
  status.json
  cache/
  memory/
  features/
  prompts/
  reports/
```

Feature artifacts live under:

```text
.visp/features/001-add-note-pinning/
  intent.json
  clarifications.json
  spec.json
  plan.json
  task-graph.json
  traceability.json
  context/
  review/
  reconcile/
  verification.json
  pr.json
```

See [docs/artifacts.md](docs/artifacts.md).

## Example Project

A small TypeScript fixture is available in [examples/basic-typescript](examples/basic-typescript).

```bash
cd examples/basic-typescript
pnpm install
pnpm test
```

Use it as a simple target project for trying the Visp workflow.

## Troubleshooting

Run:

```bash
visp doctor
```

Common fixes:

- Missing `.visp/`: run `visp init`.
- Missing scan cache: run `visp scan`.
- Missing constitution: run `visp constitution`.
- No active feature: run `visp feature "Your feature"`.
- Unsure what to do next: run `visp next --explain`.

See [docs/troubleshooting.md](docs/troubleshooting.md).

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm pack
```

See [docs/development.md](docs/development.md).

## Status

Visp Kit currently provides the full local MVP workflow:

```text
init -> scan -> constitution -> feature -> clarify -> spec -> plan -> tasks
-> context -> verify -> review -> reconcile -> status/next/doctor/pr
```

The project does not publish packages, create releases, call LLM providers, or open PRs automatically.

## License

Apache-2.0. See [LICENSE](LICENSE).
