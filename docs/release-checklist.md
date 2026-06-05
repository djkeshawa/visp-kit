# Release Checklist

This checklist prepares Visp Kit for a first public alpha or internal company pilot.

It does not publish, tag, push, or create a GitHub release.

## Package Metadata

- [ ] `package.json` name is correct.
- [ ] Version is intentional.
- [ ] Description reflects strict, token-efficient agent harness positioning.
- [ ] License field matches `LICENSE`.
- [ ] Repository, bugs, and homepage metadata are correct.
- [ ] `bin.visp` points to `dist/index.js`.
- [ ] `files` includes only intended package content.
- [ ] No accidental local paths are present.
- [ ] No unnecessary production dependencies were added.

## Build And Test

- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm typecheck` passes if run separately.
- [ ] `node dist/index.js --help` works.
- [ ] Command help works:
  - [ ] `node dist/index.js policy --help`
  - [ ] `node dist/index.js gate --help`
  - [ ] `node dist/index.js agent --help`
  - [ ] `node dist/index.js override --help`
  - [ ] `node dist/index.js status --help`
  - [ ] `node dist/index.js next --help`
  - [ ] `node dist/index.js pr --help`

## Package Dry Run

- [ ] `npm pack --dry-run` works.
- [ ] Package contents are inspected.
- [ ] Tests, temporary files, cache files, and local project artifacts are not accidentally packaged.
- [ ] README does not claim npm publishing has happened unless it has.

## Dogfood Flow

Run:

```bash
scripts/dogfood-strict-agent-workflow.sh
```

Or manually verify:

- [ ] temp project can run `visp init --strictness strict`
- [ ] `visp policy validate` passes
- [ ] `visp agent bootstrap codex` works on a fresh temp project.
- [ ] `visp agent install codex` works on an initialized project.
- [ ] `visp agent doctor --target codex` works
- [ ] feature workflow reaches `visp context T001`
- [ ] `visp gate implement --task T001` is allowed after context exists
- [ ] `visp budget` runs
- [ ] `visp status`, `visp next`, and `visp doctor` run
- [ ] override create/list/validate work
- [ ] no external AI tool is called

## Agent Targets

- [ ] `visp agent list` shows `codex`, `generic`, `claude`, and `copilot`.
- [ ] `visp agent bootstrap codex --dry-run` writes nothing.
- [ ] `visp agent install codex --dry-run` writes nothing.
- [ ] `visp agent install generic --dry-run` writes nothing.
- [ ] `visp agent install claude --dry-run` writes nothing.
- [ ] `visp agent install copilot --dry-run` writes nothing.
- [ ] Agent doctor passes after install for each target.

## Policy, Gates, Overrides

- [ ] `visp policy init --strictness strict` creates valid policy.
- [ ] `visp gate next` recommends the next allowed command.
- [ ] `visp gate implement --task T001` blocks before context and allows after context.
- [ ] `visp gate pr` blocks when required evidence is missing.
- [ ] `visp override create` requires a meaningful reason.
- [ ] `visp override validate` catches invalid overrides.
- [ ] Non-overridable rules cannot be overridden.

## Documentation

- [ ] README quickstart uses implemented commands.
- [ ] Command reference includes all implemented commands.
- [ ] Policy docs include VSP001 through VSP020.
- [ ] Agent docs include codex, generic, claude, and copilot.
- [ ] Override docs explain non-overridable rules.
- [ ] Docs do not claim Visp Kit calls LLMs directly.
- [ ] Docs do not claim npm package is published unless it is.
- [ ] Docs do not document unsupported commands as implemented.

## Release Actions

Only after manual approval:

- [ ] Commit release changes.
- [ ] Tag version.
- [ ] Publish to npm.
- [ ] Create GitHub release.
