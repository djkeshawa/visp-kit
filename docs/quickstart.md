# Quickstart

This guide shows the shortest practical Visp Kit loop for a local project.

## Prerequisites

- Node.js 20+
- pnpm 11+
- Git if you want review, reconcile, and PR diff evidence

## Install

Install the CLI globally after npm publishing:

```bash
npm install -g visp-kit
visp --version
visp --help
```

For local development, build this repository and install or link the local CLI package.

Use Node.js 20 or newer:

```bash
nvm install 20
nvm use 20
node --version
```

Enable pnpm:

```bash
corepack enable
corepack prepare pnpm@11.3.0 --activate
pnpm --version
```

Build:

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

Package-style install for a closer npm publishing smoke test:

```bash
npm pack
npm install -g ./visp-kit-0.1.1.tgz
visp --version
visp --help
```

Recommended while actively editing Visp Kit:

```bash
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

## Optional: Install GitHub Spec Kit First

If you want Spec Kit to handle spec-driven planning, install it before adding
Visp Kit to the target project. Visp Kit does not install or invoke Spec Kit.

Spec Kit's maintained package comes from the GitHub repository. Replace
`vX.Y.Z` with the release tag you intend to use:

```bash
uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z
specify version
specify init my-project --integration copilot
cd my-project
```

Use the Spec Kit integration that matches your coding tool. Then continue with
Visp Kit bootstrap in the same project.

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
visp checklist status --task T001
visp budget --task T001 --record-usage --input-tokens <actual> --output-tokens <actual> --write-report
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp pr
```

If your AI tool does not expose numeric token usage, record that explicitly:

```bash
visp budget --task T001 \
  --record-usage-unavailable \
  --model codex \
  --usage-note "Agent surface did not expose numeric token usage." \
  --write-report
```

`visp context --next` also writes a machine-readable implementation checklist:

```text
.visp/features/<feature>/context/T001.implementation-checklist.json
```

Use `visp checklist status --task T001` and `visp checklist update --task T001 --item <id> --status <status>` when the agent cannot update checklist evidence automatically.

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
