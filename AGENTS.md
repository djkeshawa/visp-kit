# AGENTS.md

Guidance for Codex and other coding agents working on this repository.

## Build Rules

- Follow `visp-kit-implementation-plan.md` phase by phase.
- Do not implement later phases unless the user explicitly requests them.
- Use TypeScript on Node.js 24+ with pnpm.
- Keep files small and focused.
- Keep the CLI skeleton simple until workflow phases add commands.
- Add focused tests for implemented behavior.
- Run `pnpm build` and `pnpm test` before reporting completion when possible.

## Current Scope

The local MVP workflow has been implemented:

- `init`, `scan`, and `constitution`
- `feature`, `clarify`, `spec`, `plan`, and `tasks`
- `context` and `budget`
- `verify`, `review`, and `reconcile`
- `status`, `next`, `doctor`, and `pr`

The current phase is documentation, examples, packaging, and release-readiness polish only.

Do not add new workflow commands unless the user explicitly asks for a later phase or a tiny help/metadata fix.
