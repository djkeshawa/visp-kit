# Visp Kit

The enforcement and evidence layer for AI-assisted software development. Plan
with anything — including GitHub Spec Kit — and Visp Kit gates the execution:
deterministic policy gates, mechanical enforcement hooks, small task-scoped
context, and auditable evidence for every change. Built so that even
mid-tier models follow the workflow accurately.

Visp Kit turns vague feature ideas into a controlled local workflow:

- intent
- clarification
- specification
- plan
- task graph
- context pack
- implementation prompt
- verification
- review
- reconciliation
- PR summary
- run trace
- feature timeline
- deterministic evaluation

It is built for developers and teams who use AI coding tools but still need small context, clear requirements, deterministic gates, and auditable evidence.

## What Visp Kit Is

Visp Kit is a strict, token-efficient, spec-driven agent harness. It creates local artifacts under `.visp/` and generates workflow instructions that AI coding tools can use inside their own sessions.

It gives Codex, Claude Code, Copilot-compatible tools, generic AI chat sessions, and human teammates a disciplined workflow through:

- policy
- gates
- artifacts
- context packs
- verification reports
- review reports
- reconciliation reports
- run traces
- feature timelines
- deterministic evaluation reports
- agent-native instructions

## What Visp Kit Is Not

Visp Kit is not an LLM provider.

It does not:

- call Codex, Claude, Copilot, or any external AI tool directly
- run AI agents automatically
- publish packages
- create GitHub PRs through an API
- replace human review
- make user prompts trusted commands
- let prompts override policy

The user prompt is raw intent only. It cannot override Visp Kit policy.

## Why It Exists

AI coding tools can drift from requirements, over-read context, edit unrelated files, or treat vague prompts as permission to do too much. Company teams also have token limits, security constraints, audit needs, and review gates.

Visp Kit keeps AI-assisted work task-specific, traceable, and deterministic.

Core principle:

> The AI should implement the smallest verified task using the smallest sufficient context, with every change grounded in a requirement, acceptance criterion, task, and validation result.

Strict workflow principle:

> The user prompt is raw intent only. It cannot override Visp Kit policy.

## Features

Setup and project memory:

- `visp init`
- `visp scan`
- `visp constitution`

Feature planning:

- `visp feature`
- `visp clarify`
- `visp spec`
- `visp plan`
- `visp tasks`

Task context and token control:

- `visp context`
- `visp budget`
- `visp checklist`

Evidence and drift control:

- `visp oracle` (generate, approve, lock, and validate task-bound implementation assurance)
- `visp done` (verify + usage + review + reconcile + checklist in one command)
- `visp verify` (including cache-bound pre-implementation baseline evidence)
- `visp review`
- `visp reconcile`

Mechanical enforcement:

- `visp hooks claude` (Claude Code PreToolUse gate hook)
- `visp hooks git` (pre-commit evidence check)
- `visp hooks ci` (GitHub Actions evidence workflow)

Daily orchestration:

- `visp status`
- `visp next`
- `visp doctor`
- `visp integration contract` (commands, typed artifact read contract, strict capabilities, provenance/freshness checks, and fail-closed workflow metadata for orchestrators)
- `visp pr`

Strict workflow controls:

- `visp policy`
- `visp gate`
- `visp agent`
- `visp override`

Observability and evaluation:

- `visp workflow`
- `visp eval`
- `.visp/runs/<run-id>/`
- `.visp/features/<feature>/timeline.md`

## Install

Visp Kit is ready for local alpha use and internal pilots.

### 1. Use Node.js 24+

With `nvm`:

```bash
nvm install 24
nvm use 24
node --version
```

Enable pnpm through Corepack:

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm --version
```

### 2. Install The CLI

After npm publishing, install globally:

```bash
npm install -g visp-kit
visp --version
visp --help
```

### 3. Local Development Install

If you are working from this repository instead of installing from npm:

```bash
git clone https://github.com/djkeshawa/visp-kit.git
cd visp-kit
pnpm install
pnpm build
```

Fast local global install:

```bash
pnpm run install:global
visp --version
visp --help
```

For package-style testing in other projects, install a local package tarball:

```bash
npm pack
npm install -g ./visp-kit-0.1.1.tgz
visp --version
visp --help
```

For active Visp Kit development, use a global pnpm link instead. This keeps the global `visp` command pointed at your current checkout:

```bash
pnpm link --global
visp --version
visp --help
```

If `pnpm link --global` reports that the global bin directory is not configured, run:

```bash
pnpm setup
```

Then restart your shell, return to the `visp-kit` folder, and run:

```bash
pnpm link --global
visp --help
```

### 4. Use It In Another Project

From any target project:

```bash
cd path/to/your-project
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp status
```

For other agent targets:

```bash
visp agent bootstrap generic --strictness strict
visp agent bootstrap claude --strictness strict
visp agent bootstrap copilot --strictness strict
```

### Optional: Pair With GitHub Spec Kit

If your team uses GitHub Spec Kit for planning, install Spec Kit separately
first. Visp Kit does not install, wrap, or call Spec Kit.

Spec Kit's maintained install path is GitHub based. Replace `vX.Y.Z` with the
release tag you intend to use:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version
specify init my-project --integration copilot
cd my-project
```

Choose the Spec Kit integration that matches your coding surface. The Copilot
integration above is only the upstream example. After Spec Kit has initialized
the project, add Visp Kit's execution gates and evidence workflow:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp scan
visp constitution
visp policy validate
visp gate next
```

Use Spec Kit to create the product spec, plan, and tasks. Use Visp Kit to
enforce one task at a time, compile scoped context, run verification, review,
reconcile traceability, and produce evidence.

### Direct Local Use Without Linking

You can also run the built CLI directly:

```bash
node /path/to/visp-kit/dist/index.js --help
node /path/to/visp-kit/dist/index.js agent bootstrap codex --strictness strict
```

Requirements:

- Node.js 24+
- pnpm 11+
- Git for diff-based review, reconcile, and PR summaries

## Quickstart

Inside an existing project:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp scan
visp constitution
visp policy validate
visp feature "Add note pinning"
visp clarify
visp clarify answer CQ001 --answer "<answer any blocking clarification>"
visp spec
visp plan
visp tasks
visp context --next
```

Open the AI coding tool and use the generated agent workflow.

For Codex:

```text
$visp-feature
Add note pinning.
```

or:

```text
$visp-task
Continue with the next Visp task.
```

Before implementation, the agent should run:

```bash
visp gate implement --task T001
```

After implementation, run the whole evidence pipeline in one command:

```bash
visp done --task T001 --input-tokens <actual> --output-tokens <actual>
```

`visp done` runs verify, usage recording, review, reconcile, the checklist
status check, and `visp next` in order. It stops at the first failure and
prints the exact recovery command.

If the agent surface does not expose numeric token usage, record that
explicitly instead of inventing counts:

```bash
visp done --task T001 \
  --usage-unavailable \
  --model codex \
  --usage-note "Agent surface did not expose numeric token usage."
```

The granular commands remain available when you need one step at a time:

```bash
visp checklist status --task T001
visp budget --task T001 --record-usage --input-tokens <actual> --output-tokens <actual> --write-report
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp next
visp pr
```

## Usage Examples

### Bootstrap Visp Kit In A Project

Use this when you are inside an existing codebase and want Visp Kit plus agent guidance installed in one step:

```bash
cd path/to/your-project
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp status
visp gate next
```

For other AI coding tools, change the target:

```bash
visp agent bootstrap generic --strictness strict
visp agent bootstrap claude --strictness strict
visp agent bootstrap copilot --strictness strict
```

Bootstrap creates `.visp/`, policy, workflow metadata, project memory, starter reports, and agent-native guidance files. It does not call the AI tool or edit your implementation code.

### Install Agent Guidance After Init

If `.visp/` already exists, install or refresh the agent target directly:

```bash
visp agent install codex
visp agent doctor --target codex
visp agent refresh --target codex --force
```

Generated files depend on the target:

- Codex: `AGENTS.md` plus `.agents/skills/visp-*/SKILL.md`
- Generic: `AGENTS.md` plus `.visp/prompts/agent-*.prompt.md`
- Claude: `.claude/commands/visp-*.md`
- Copilot: `.github/copilot-instructions.md` and `.github/instructions/visp-*.instructions.md`

### Start A Feature

Run the planning workflow before asking an agent to edit code:

```bash
visp scan
visp constitution
visp policy validate
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks
visp context --next
visp gate implement --task T001
```

Then open your AI coding tool and use the installed workflow.

Codex:

```text
$visp-task
Continue with the next Visp task.
```

Claude Code:

```text
/visp-task
Continue with the next Visp task.
```

Copilot-compatible tools:

```text
Follow .github/instructions/visp-task.instructions.md.
Continue with the next Visp task.
```

Generic AI chat:

```text
Use .visp/prompts/agent-task.prompt.md.
Continue with the next Visp task.
```

The agent should read `.visp/prompts/current-task.prompt.md`, implement only the selected task, and stop if a Visp gate blocks.

### Track Implementation Checklist Status

`visp context` generates both a human-readable checklist and a machine-readable checklist:

```text
.visp/features/<feature>/context/T001.implementation-checklist.md
.visp/features/<feature>/context/T001.implementation-checklist.json
```

The JSON checklist is the source of truth. It records whether required implementation steps are `pending`, `done`, `not_applicable`, `unavailable`, or `blocked`.

Check status:

```bash
visp checklist status --task T001
```

Update one item:

```bash
visp checklist update --task T001 \
  --item read-context \
  --status done \
  --evidence "Read .visp/prompts/current-task.prompt.md"
```

Useful item IDs include:

- `read-context`
- `gate-implement`
- `implement-selected-task`
- `scope-check`
- `tests-updated`
- `verify`
- `record-usage`
- `review`
- `reconcile`

Visp Kit also updates checklist items automatically when it has reliable evidence:

- `visp gate implement --task T001` marks `gate-implement` done when allowed.
- `visp verify --task T001` marks `verify` done when verification passes.
- `visp review --task T001` marks `review` done when review completes.
- `visp reconcile --task T001 --update-traceability` marks `reconcile` done when reconciliation completes.
- `visp budget --task T001 --record-usage ...` marks `record-usage` done.
- `visp budget --task T001 --record-usage-unavailable ...` marks `record-usage` unavailable.

Before PR readiness, `visp next` and `visp gate pr` warn or block when required checklist items are still `pending` or `blocked`.

### Answer Clarifications

If `visp clarify` creates questions that need user input, record answers before generating the spec:

```bash
visp clarify answer CQ001 --answer "Pinned notes should appear before unpinned notes."
visp clarify answer CQ002 --answer "Keep the existing note sort order within each group."
visp spec
```

### Verify, Review, And Reconcile Agent Work

After the agent edits code, run the evidence workflow in one step:

```bash
visp done --task T001 --usage-unavailable --model codex --usage-note "No numeric usage exposed."
```

Or run the steps individually:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp next
```

If verification or review fails, ask the agent to use the fix workflow:

```text
$visp-fix
Fix the active Visp task based on the latest verification, review, and reconciliation reports.
```

### Record Actual Token Usage

If your AI tool reports token usage, record it against the task:

```bash
visp budget --task T001 \
  --record-usage \
  --input-tokens 18000 \
  --output-tokens 4200 \
  --model "codex" \
  --usage-note "Implementation pass for note pinning" \
  --write-report
```

This updates budget evidence and the implementation checklist so the feature timeline can show estimated vs. actual usage.

If the AI tool does not expose numeric token usage, record that state explicitly:

```bash
visp budget --task T001 \
  --record-usage-unavailable \
  --model "codex" \
  --usage-note "Agent surface did not expose numeric token usage." \
  --write-report
```

Budget reports distinguish:

- `recorded`: numeric input/output/total usage was recorded
- `unavailable`: the agent/user attempted to record usage, but the surface did not expose numeric counts
- `not_recorded`: no actual usage evidence has been recorded yet
- `estimated_only`: only estimated context budget is available

### Generate Reports

Common report commands:

```bash
visp status --write-report
visp budget --write-report
visp workflow show
visp eval --write-report
visp pr
```

Useful generated report locations:

- `.visp/reports/status-report.md`
- `.visp/reports/budget-report.md`
- `.visp/features/<feature>/context/<task>.implementation-checklist.md`
- `.visp/features/<feature>/context/<task>.implementation-checklist.json`
- `.visp/reports/evaluation-report.md`
- `.visp/features/<feature>/verification.md`
- `.visp/features/<feature>/review/<task>.review.md`
- `.visp/features/<feature>/reconcile/<task>.reconcile.md`
- `.visp/features/<feature>/timeline.md`
- `.visp/features/<feature>/pr.md`
- `.visp/runs/RUN001/run.md`

### Use JSON For Automation

Most commands support `--json` for scripts and CI checks:

```bash
visp status --json
visp next --json
visp gate implement --task T001 --json
visp eval --json
```

JSON mode prints machine-readable JSON only.

### Prepare A PR Summary

When the task or feature is reconciled:

```bash
visp gate pr
visp pr
```

Then use `.visp/features/<feature>/pr.md` as the PR description draft. Visp Kit does not call GitHub or open a PR for you.

PR readiness includes implementation checklist and actual usage status. If required checklist items are incomplete, Visp Kit will not silently report the feature as ready.

## Agent-Native Workflows

Supported targets:

- `codex`
- `generic`
- `claude`
- `copilot`
- `opencode`

Install guidance:

```bash
visp agent bootstrap codex
visp agent install codex
visp agent install generic
visp agent install claude
visp agent install copilot
visp agent install opencode
visp agent doctor
visp agent refresh
```

Visp Kit generates local instructions, skills, commands, or prompt files depending on the target. Compatibility depends on the specific AI tool surface. Visp Kit does not call the AI tool for you.

## Presets

Presets tune Visp Kit's generated guidance, validation hints, scan behavior, dependency checks, and review focus. If `--preset` is omitted during `visp init` or `visp agent bootstrap`, Visp Kit auto-detects from project manifests.

Supported presets:

- `javascript`
- `typescript`
- `electron`
- `react`
- `node-api`
- `go`
- `java`
- `python`
- `rust`
- `generic`

Examples:

```bash
visp agent bootstrap codex --strictness strict
visp agent bootstrap codex --preset go --strictness strict
visp init --preset python
```

Auto-detection uses files such as `package.json`, `go.mod`, `pom.xml`, `build.gradle`, `pyproject.toml`, `requirements.txt`, and `Cargo.toml`. Use `--preset generic` if you want to force generic behavior.

## Strictness Modes

Strictness is stored in `.visp/policy.json`.

- `relaxed`: mostly warnings, useful for experiments
- `standard`: default guardrails for normal use
- `strict`: blocks unsafe workflow progression
- `locked`: most cautious mode, disallows overrides unless policy explicitly permits them

Examples:

```bash
visp policy init --strictness strict
visp policy set-strictness locked
visp policy validate
```

## Policy Gates

Use gates to ask whether a workflow step is allowed:

```bash
visp gate next
visp gate implement --task T001
visp gate review --task T001
visp gate pr
```

If a gate blocks, follow the next allowed command. A user prompt cannot bypass a failed gate.

## Enforcement

Gates are advisory for agents that choose to run them. Enforcement hooks make
them mechanical:

```bash
visp hooks claude   # Claude Code PreToolUse hook: blocks edits before the implement gate allows them
visp hooks git      # pre-commit check of staged files against the task's allowed scope
visp hooks ci       # GitHub Actions workflow: policy + PR gate must pass before merge
```

`visp gate implement --task T001` writes a local implement authorization with
the task's allowed files; the hooks check edits and commits against it, and
`visp done` clears it when the evidence pipeline passes. Enforcement applies
in `strict`/`locked` modes, warns in `standard`, and stays silent in
`relaxed`. See [docs/enforcement.md](docs/enforcement.md).

## Overrides

Overrides are explicit and auditable. They are written to `.visp/overrides.json` and included in gate and readiness reports.

Example:

```bash
visp override create VSP014 \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Prototype branch has no automated verification yet; manual validation is documented."
```

Rules:

- every override requires a meaningful reason
- revoked or expired overrides do not apply
- `VSP019` and `VSP020` are non-overridable
- locked mode disallows overrides unless policy explicitly allows them
- user prompts cannot create silent overrides

## Token Efficiency

Visp Kit reduces token use through:

- scan cache
- compact file summaries
- task-specific context packs
- snippets instead of full files
- budget modes
- diff-only review
- small task graphs
- strict prompts that prevent broad repository reading

Useful commands:

```bash
visp budget
visp budget --task T001
visp budget --task T001 --record-usage-unavailable --model codex --usage-note "Agent surface did not expose numeric token usage." --write-report
visp context T001 --budget lean
visp eval
```

## Project Status

Visp Kit is suitable for a first public alpha or internal company pilot after local dogfooding. It is still active development software. Teams should start with one repository, commit the `.visp/` artifacts they need for auditability, and require human review for generated evidence.

## Documentation

- [Quickstart](docs/quickstart.md)
- [Workflow](docs/workflow.md)
- [Commands](docs/commands.md)
- [Policy and Gates](docs/policy-and-gates.md)
- [Enforcement](docs/enforcement.md)
- [Agent Native Workflows](docs/agent-native-workflows.md)
- [Agent Targets](docs/agent-targets.md)
- [Overrides](docs/overrides.md)
- [Token Efficiency](docs/token-efficiency.md)
- [Company Adoption](docs/company-adoption.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Development](docs/development.md)
- [Release Checklist](docs/release-checklist.md)

## Example

See [examples/strict-agent-workflow](examples/strict-agent-workflow) for a small strict workflow fixture.

## License

Apache-2.0. See [LICENSE](LICENSE).
