# Development

This guide is for contributors working on Visp Kit itself.

## Requirements

- Node.js 22+
- pnpm 11+

## Setup

```bash
pnpm install
pnpm test
pnpm build
```

Useful scripts from `package.json`:

```bash
pnpm test
pnpm build
pnpm typecheck
npm pack --dry-run
```

## Project Structure

```text
src/
  artifacts/      schemas, artifact readers/writers, paths
  cli/            commander command handlers
  workflows/      command workflow orchestration
  gates/          deterministic gate engine
  policy/         policy defaults, loading, validation, rendering
  overrides/      recorded override validation and matching
  agent/          agent target rendering and installation
  context/        context pack compilation
  verification/   verification helpers
  review/         review helpers
  reconcile/      reconciliation helpers
  pr/             PR summary helpers
  doctor/         project health checks
  orchestrator/   project state and next-step logic
```

## Command Architecture

Command handlers should stay thin:

1. parse CLI arguments
2. call a workflow function
3. format result or error
4. preserve JSON-only output when `--json` is used

Workflow logic belongs under `src/workflows/`.

## Schema Conventions

- JSON artifacts must have Zod schemas under `src/artifacts/schemas/`.
- Generated JSON should be validated before writing.
- Use 2-space JSON formatting through existing artifact/file utilities.
- Do not weaken schemas to make invalid artifacts pass.

## Adding A Command

1. Add `src/cli/commands/<name>.command.ts`.
2. Add `src/workflows/<name>.workflow.ts`.
3. Register it in `src/cli/main.ts`.
4. Add help tests in `tests/unit/cli-main.test.ts`.
5. Add workflow and integration tests.

## Adding An Agent Target

1. Add a target under `src/agent/targets/`.
2. Reuse shared agent templates.
3. Update agent schema target enum.
4. Update installer, doctor, refresh, and target list behavior.
5. Add target tests and docs.

Do not call the external AI tool. Agent targets generate local guidance only.

## Adding A Policy Rule Or Gate

1. Add the rule definition in policy defaults.
2. Add schema fields if needed.
3. Add stage checks in `src/gates/stage-checks.ts`.
4. Update policy/gate docs.
5. Add tests for strictness behavior and gate output.

## Adding Override Behavior

Override behavior must remain explicit and auditable.

Rules:

- reason required
- non-overridable rules remain protected
- revoked and expired overrides do not apply
- locked mode does not allow overrides unless policy explicitly permits it
- gate reports must show applied overrides

## Testing Strategy

Use focused unit tests for:

- schemas
- deterministic helpers
- policy and gate behavior
- override matching
- renderers

Use integration tests for:

- CLI command lifecycle
- JSON-only output
- dry-run write safety
- generated artifact paths
- gate exit behavior

## Dogfooding

Run:

```bash
scripts/dogfood-strict-agent-workflow.sh
```

The script creates a temporary project and exercises strict policy, agent installation, feature artifacts, context generation, gates, budget, status, doctor, and overrides without calling external AI tools.

## Release Readiness

Before release or pilot:

```bash
pnpm test
pnpm build
npm pack --dry-run
node dist/index.js --help
```

Then follow [release-checklist.md](release-checklist.md).
