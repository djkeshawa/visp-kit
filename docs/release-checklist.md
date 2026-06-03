# Release Checklist

This checklist prepares Visp Kit for an npm release. It does not publish, tag, or create a GitHub release.

## Package

- [ ] `package.json` name is correct.
- [ ] Version is correct.
- [ ] License is correct.
- [ ] Repository metadata is correct.
- [ ] `files` includes `dist`, docs, examples, README, AGENTS, and LICENSE.
- [ ] No unnecessary dependencies were added.

## Build And Test

- [ ] `pnpm test` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm pack` succeeds.
- [ ] `node dist/index.js --help` works.
- [ ] New command help works.

## Manual Dogfood

- [ ] Temp project can run `visp init`.
- [ ] Temp project can run `visp scan`.
- [ ] Feature workflow reaches `visp context`.
- [ ] Verification report is generated.
- [ ] Review report is generated.
- [ ] Reconcile report is generated.
- [ ] PR summary is generated.
- [ ] JSON modes are parseable.

## Documentation

- [ ] README is complete.
- [ ] Quickstart is complete.
- [ ] Command reference is complete.
- [ ] Codex guide is complete.
- [ ] Token-efficiency guide is complete.
- [ ] Troubleshooting is complete.
- [ ] Company adoption guide is complete.

## Release Actions

Do these only when intentionally releasing:

- [ ] Commit release changes.
- [ ] Tag version.
- [ ] Publish to npm.
- [ ] Create GitHub release.
