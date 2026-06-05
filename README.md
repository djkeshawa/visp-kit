# Visp Kit

A strict, token-efficient agent harness for accurate AI-assisted software development.

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

Evidence and drift control:

- `visp verify`
- `visp review`
- `visp reconcile`

Daily orchestration:

- `visp status`
- `visp next`
- `visp doctor`
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

Visp Kit is ready for local alpha use and internal pilots. It is not assumed to be published to npm yet, so install it from this repository.

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

### 2. Build Visp Kit

```bash
git clone https://github.com/djkeshawa/visp-kit.git
cd visp-kit
pnpm install
pnpm build
```

### 3. Install The CLI

Fast local global install:

```bash
pnpm run install:global
visp --version
visp --help
```

For package-style testing in other projects, install a local package tarball. This behaves closer to a future published npm install than a development symlink:

```bash
npm pack
npm install -g ./visp-kit-0.1.0.tgz
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

### Direct Local Use Without Linking

You can also run the built CLI directly:

```bash
node /path/to/visp-kit/dist/index.js --help
node /path/to/visp-kit/dist/index.js agent bootstrap codex --strictness strict
```

### Future npm Install

After package publishing:

```bash
npm install -g visp-kit
visp --help
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

After implementation:

```bash
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

### Answer Clarifications

If `visp clarify` creates questions that need user input, record answers before generating the spec:

```bash
visp clarify answer CQ001 --answer "Pinned notes should appear before unpinned notes."
visp clarify answer CQ002 --answer "Keep the existing note sort order within each group."
visp spec
```

### Verify, Review, And Reconcile Agent Work

After the agent edits code, run the evidence workflow:

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

## Agent-Native Workflows

Supported targets:

- `codex`
- `generic`
- `claude`
- `copilot`

Install guidance:

```bash
visp agent bootstrap codex
visp agent install codex
visp agent install generic
visp agent install claude
visp agent install copilot
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
