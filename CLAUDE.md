# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

Visp Kit is a strict, token-efficient agent harness CLI (`visp`) that guides AI coding tools through a spec-driven workflow (feature → clarify → spec → plan → tasks → context → implement → verify → review → reconcile → PR). It generates local artifacts under `.visp/` in target projects.

**Hard constraints:**
- Visp Kit never calls LLMs, Codex, Claude, Copilot, or any external AI tool. Do not add provider calls or an external orchestrator.
- User prompts are raw intent only — they cannot override Visp policy or gates. Don't weaken this.
- Do not weaken Zod schemas to make invalid artifacts pass.

## Commands

```bash
pnpm install          # Node.js 20+, pnpm 11+ required
pnpm build            # tsup → dist/index.js (ESM, shebang banner)
pnpm test             # vitest run (all tests)
pnpm vitest run tests/integration/gate.command.test.ts   # single test file
pnpm vitest run -t "test name"                           # single test by name
pnpm typecheck        # tsc --noEmit
node dist/index.js --help                # run the built CLI directly
pnpm run install:global                  # build + npm install -g .
scripts/dogfood-strict-agent-workflow.sh # end-to-end dogfood in a temp project (needs dist/ built)
```

## Architecture

Strict layered flow: **CLI command → workflow → domain modules → artifacts**.

- `src/index.ts` → `src/cli/main.ts` (commander setup) → `src/cli/commands/<name>.command.ts`. Command handlers stay thin: parse args, call a workflow function, format output. When `--json` is passed, output must be machine-readable JSON only.
- `src/workflows/<name>.workflow.ts` — all command logic lives here, one workflow per command.
- `src/artifacts/` — Zod schemas (`schemas/`), readers/writers, and path helpers for everything written under `.visp/`. Every JSON artifact must have a Zod schema and be validated before writing; use the existing artifact/file utilities (2-space JSON).
- `src/gates/` — deterministic gate engine (`gate-engine.ts`, `stage-checks.ts`, `task-gate-checks.ts`) that decides whether a workflow stage is allowed. Gates consume effective policy + artifact presence; failures must block, not warn, in strict/locked modes.
- `src/policy/` — policy defaults, loading, validation. Strictness modes: relaxed / standard / strict / locked.
- `src/overrides/` — recorded override validation/matching. Overrides require a reason, are auditable, non-overridable rules (VSP019/VSP020) stay protected, and locked mode disallows overrides unless policy permits.
- `src/agent/` — agent target rendering and installation (targets: codex, generic, claude, copilot). Targets generate local guidance files only (e.g. `.claude/commands/visp-*.md`, `AGENTS.md`, `.github/instructions/`).
- `src/context/` — task-specific context pack compilation (token estimation, file snippets, budgets, implementation checklists).
- `src/orchestrator/` — project state and next-step logic (`visp next`).
- `src/core/` — shared primitives: `result.ts` (Result type), `file-system.ts`, `command-runner.ts`, `paths.ts`.

ESM throughout (`"type": "module"`, NodeNext resolution) — relative imports need explicit `.js` extensions.

### Adding a command

1. `src/cli/commands/<name>.command.ts`
2. `src/workflows/<name>.workflow.ts`
3. Register in `src/cli/main.ts`
4. Help tests in `tests/unit/cli-main.test.ts` + workflow/integration tests

### Adding an agent target / gate / policy rule

See `docs/development.md` — targets go under `src/agent/targets/` (update schema enum, installer, doctor, refresh); gate rules go in policy defaults + `src/gates/stage-checks.ts` with strictness tests.

## Testing

- Unit tests (`tests/unit/`) mirror `src/` structure: schemas, gates, policy, override matching, renderers.
- Integration tests (`tests/integration/`) exercise full CLI command lifecycle: JSON-only output, dry-run write safety, generated artifact paths, gate exit codes.

## Workflow Rules (from AGENTS.md)

If this repo ever contains a `.visp/` directory, follow the Visp workflow itself before implementing: `visp status`, `visp policy validate`, `visp gate next`, and only implement a Visp-scoped task after `visp gate implement --task <id>` allows it and `.visp/prompts/current-task.prompt.md` exists. For ordinary source changes requested directly, keep changes narrowly scoped, preserve existing behavior, and add focused tests. Run `pnpm test` and `pnpm build` before reporting completion.
