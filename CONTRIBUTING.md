# Contributing

Bug reports and pull requests are welcome.

## What is most useful

This project's whole claim is that it stops unproven work reaching review. So
the most valuable report is one showing it failed at that:

- **It allowed something it should have blocked.** The most serious class of
  defect, because it is a failure of the central claim.
- **It blocked something correct and in scope.** Over-blocking is a real defect,
  not an inconvenience to be tuned away.
- **It gave confident guidance from state it could not read**, or reported a
  problem without saying what to do about it.

Documentation that overstates what this tool has been shown to do is also a bug.
No productivity or correctness claim has been substantiated, so if you find one
in the docs, report it.

## Reporting a bug

Include:

1. The exact command and arguments.
2. What you expected, and what happened.
3. The relevant contents of `.visp/`, redacted as needed — those artifacts
   describe your code.
4. `visp --version`, your Node version, and your operating system.

## Security issues

Do **not** open a public issue. Follow [SECURITY.md](SECURITY.md).

## Pull requests

```bash
pnpm install
pnpm build
pnpm test
```

Node 22+ and pnpm 11+.

Before opening a PR:

- `pnpm check` passes. It is exactly `pnpm typecheck && pnpm schema:check &&
  pnpm lint && pnpm test` in one command, so the linter cannot be the step
  everyone forgets — Phase 21 found sixteen accumulated lint errors precisely
  because nothing ran it as part of a gate command.
- New behaviour has a test. A test written to match the code you just wrote is
  weaker evidence than one written from the requirement — this project cares
  about that distinction more than most.
- The change is narrow. Unrelated cleanups in the same PR make review harder.

### Three constraints that will not be relaxed

A PR crossing any of these will be declined regardless of quality:

1. **Visp Kit never calls an LLM** — no provider calls, no external
   orchestrator. It runs beside your AI tool, not in place of it.
2. **A user prompt is raw intent only.** Nothing typed into a prompt may widen a
   task's scope, skip a gate, or approve a change.
3. **Schemas are not weakened to let invalid artifacts through.** If an artifact
   fails validation, fix the artifact.

See [docs/development.md](docs/development.md) for architecture. The repository
also carries an `AGENTS.md` at its root with the workflow rules that apply to
coding agents working on Kit itself; it is not shipped in the package, because
it is guidance for contributors rather than users.

## Honest limitations

Before reporting something as a bug, it may be a known limit:

- **Conformance is partial.** Some areas are proven and some are not.
- **Compatibility is proven pair by pair**, pinned to exact commits and package
  hashes. It is not a version-range support window.
- **`inconclusive` is a deliberate verdict.** It means the evidence did not
  establish the claim, not that the claim failed.
