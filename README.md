# Visp Kit

Small context. Clear specs. Accurate code.

`visp-kit` is a lightweight, spec-driven AI development kit for creating traceable requirements, compact task context, and local verification guidance.

## Status

Phase 0 bootstrap is in progress. The package currently provides the base TypeScript CLI scaffold only.

## Requirements

- Node.js 24+
- pnpm 11+

## Development

```bash
pnpm install
pnpm build
pnpm test
node dist/index.js --help
```

## CLI

```bash
visp --help
visp --version
```

Project workflow commands will be added phase by phase from `visp-kit-implementation-plan.md`.

## Project Principles

- Keep workflow artifacts deterministic and human-readable.
- Keep context packs small and traceable.
- Prefer local validation before AI-assisted implementation.
- Add production dependencies only when a phase calls for them.
