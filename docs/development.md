# Development

This guide is for contributors working on Visp Kit itself.

## Requirements

- Node.js 24+
- pnpm 11+

## Setup

```bash
pnpm install
pnpm build
pnpm test
```

## Run The CLI

```bash
node dist/index.js --help
node dist/index.js status --help
```

## Test

```bash
pnpm test
pnpm build
pnpm pack
```

## Coding Standards

- Keep files small and focused.
- Keep command handlers thin.
- Put workflow logic under `src/workflows`.
- Keep deterministic helper logic separate from CLI parsing.
- Validate artifact JSON with schemas.
- Use dependency injection for command runners in tests.
- Do not add production dependencies without a clear need.
- Do not implement future phases unless explicitly requested.

## Manual Dogfood Flow

```bash
tmpdir=$(mktemp -d)
node dist/index.js init "$tmpdir" --agent none --preset typescript --budget lean
node dist/index.js scan "$tmpdir"
node dist/index.js constitution "$tmpdir" --preset typescript --budget lean
node dist/index.js feature "Add note pinning" "$tmpdir"
node dist/index.js clarify "$tmpdir"
node dist/index.js spec "$tmpdir" --force
node dist/index.js plan "$tmpdir" --force
node dist/index.js tasks "$tmpdir" --force
node dist/index.js context T001 "$tmpdir" --force
node dist/index.js status "$tmpdir"
node dist/index.js next "$tmpdir"
node dist/index.js doctor "$tmpdir"
```

For Git-backed review/reconcile/pr checks, initialize a Git repository in the temp project and make a source change after context generation.

## Release Readiness

Before publishing:

```bash
pnpm test
pnpm build
pnpm pack
node dist/index.js --help
```

Also review [release-checklist.md](release-checklist.md).
