# Quickstart

This guide shows the shortest practical Visp Kit loop for a local project.

## Prerequisites

- Node.js 24+
- pnpm 11+
- Git if you want review, reconcile, and PR diff evidence

## Install Locally

Visp Kit is intended for local alpha use and internal pilots. Until it is published to npm, install it by building this repository and linking the `visp` command globally.

Use Node.js 24:

```bash
nvm install 24
nvm use 24
node --version
```

Enable pnpm:

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm --version
```

Build and link:

```bash
git clone https://github.com/djkeshawa/visp-kit.git
cd visp-kit
pnpm install
pnpm build
pnpm link --global
visp --version
visp --help
```

If pnpm reports that the global bin directory is not configured:

```bash
pnpm setup
```

Restart your shell, return to the `visp-kit` folder, and run:

```bash
pnpm link --global
visp --help
```

You can also run the built CLI without linking:

```bash
node /path/to/visp-kit/dist/index.js --help
```

## Initialize A Project

From the target project root:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp scan
visp constitution
visp policy validate
```

This creates local Visp artifacts, a strict policy, scan cache, compact project rules, and Codex guidance files.

## Create A Feature

```bash
visp feature "Add note pinning"
visp clarify
visp clarify answer CQ001 --answer "<answer any blocking clarification>"
visp spec
visp plan
visp tasks
visp context --next
```

`visp context --next` writes:

```text
.visp/features/<feature>/context/T001.context.md
.visp/features/<feature>/context/T001.context.json
.visp/features/<feature>/context/T001.prompt.md
.visp/prompts/current-task.prompt.md
```

## Use The Agent Workflow

Open Codex and use:

```text
$visp-task
Continue with the next Visp task.
```

The generated Codex guidance tells the agent to run gates, read `.visp/prompts/current-task.prompt.md`, implement one task only, and stop on failed policy.

For a manual session, read:

```text
.visp/prompts/current-task.prompt.md
```

## Verify, Review, Reconcile

After implementation:

```bash
visp budget --task T001 --record-usage --input-tokens <actual> --output-tokens <actual> --write-report
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp pr
```

Only record actual token usage when your AI tool exposes it. Otherwise leave it unrecorded and mention that the usage was unavailable.

If a command fails, read the generated report and run:

```bash
visp next --explain
visp gate next --explain
visp doctor
```

## Optional Override

Overrides are explicit and auditable. Use them only when a human intentionally accepts a policy exception:

```bash
visp override create VSP014 \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Prototype branch has no automated verification yet; manual validation is documented."
```

Then validate:

```bash
visp override validate
```
