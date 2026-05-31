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

Phase 0 is project bootstrap only:

- package and TypeScript configuration
- Vitest and tsup configuration
- basic `visp --help` CLI surface
- README and agent guidance skeletons

Workflow commands, artifact schemas, scanning, and context compilation belong to later phases.
