# Troubleshooting

Start with:

```bash
visp-kit status
visp-kit next --explain
visp-kit gate next --explain
visp-kit doctor
```

## `.visp/` Is Missing

Symptom: commands fail with "Visp Kit is not initialized."

Likely cause: the target project has not been initialized.

Fix:

```bash
visp-kit agent bootstrap codex --preset typescript --budget lean --strictness strict
```

## Policy Missing

Symptom: gate output recommends `visp-kit policy init --strictness strict`.

Fix:

```bash
visp-kit policy init --strictness strict
visp-kit policy validate
```

## Policy Invalid

Symptom: `visp-kit policy validate` fails.

Fix: repair `.visp/policy.json`, then run:

```bash
visp-kit policy validate
```

## Gate Blocked

Symptom: `visp-kit gate <stage>` exits non-zero.

Fix:

```bash
visp-kit gate <stage> --task T001 --explain
```

Follow the next allowed command. A user prompt cannot override a blocked gate.

## Context Missing

Symptom: implementation gate blocks with `VSP007`.

Fix:

```bash
visp-kit context --next
visp-kit gate implement --task T001
```

## Agent Files Missing

Symptom: an AI tool does not see Visp guidance.

Fix:

```bash
visp-kit agent doctor --target codex
visp-kit agent refresh --target codex --force
```

Use `generic`, `claude`, or `copilot` for other targets.

## Codex Skills Not Detected

Likely cause: `.agents/skills/*/SKILL.md` was not generated, was skipped due to existing files, or the tool has not reloaded repository guidance.

Fix:

```bash
visp-kit agent install codex --force
visp-kit agent doctor --target codex
```

## Claude Commands Not Found

Likely cause: the active Claude Code surface does not load `.claude/commands` automatically.

Fix:

```bash
visp-kit agent install claude --force
visp-kit agent doctor --target claude
```

If needed, copy `.claude/commands/visp-feature.md` into the session.

## Copilot Instructions Not Followed

Likely cause: Copilot compatibility varies by surface.

Fix:

```bash
visp-kit agent install copilot --force
visp-kit agent doctor --target copilot
```

If needed, paste `.github/instructions/visp-feature.instructions.md` into the active Copilot chat/session.

## Override Not Applying

Likely causes:

- wrong rule ID
- wrong feature or task scope
- wrong stage scope
- override expired
- override revoked
- locked mode disallows overrides

Fix:

```bash
visp-kit override list --active
visp-kit override show OVR001
visp-kit override validate
visp-kit gate review --task T001 --explain
```

## Override Expired

Symptom: `visp-kit override validate` warns that an override has expired.

Fix:

```bash
visp-kit override revoke OVR001 --reason "The temporary exception has expired."
```

Create a new override only if the risk is still intentionally accepted.

## Non-Overridable Rule

Symptom: override creation fails for `VSP019` or `VSP020`.

Reason:

- `VSP019`: user prompts cannot override Visp policy
- `VSP020`: agents must stop on failed gates

Fix: follow the gate recommendation instead of overriding.

## Verification Failed

Read:

```text
.visp/features/<feature>/verification.md
```

Common causes:

- validation command failed
- **no validation command ran at all** (see below)
- **a declared validation entry is not runnable** (see below)
- artifact JSON invalid
- traceability broken
- out-of-scope files changed
- dependency files changed without approval

Fix:

```bash
visp-kit verify --task T001
```

### "No validation command was executed"

Nothing looked at the code, so verification refused to call the run a pass.
This is not a bug in the check; it is the absence of one. The error names the
command that fixes it:

- `visp-kit scan` — the project profile has no known test/typecheck commands.
- `visp-kit tasks --validate` — the task declared an entry that cannot run.

### "Validation command ... was not executed because it reads as a sentence"

A `validationCommands` entry is English prose, not a command. Kit does not
hand it to a shell — doing so produces `Manually: not found` and records a
manual check as a failing test.

Replace it with something a shell can run. If the check really is manual,
record it in the task description and add an automated check that proves the
same thing; a manual note in `validationCommands` is a check nobody will
perform.

## Review Failed

Read:

```text
.visp/features/<feature>/review/T001.review.md
```

Fix blocking findings, then run:

```bash
visp-kit verify --task T001
visp-kit review --task T001
```

## Reconcile Failed

Read:

```text
.visp/features/<feature>/reconcile/T001.reconcile.md
```

Fix drift or missing evidence, then run:

```bash
visp-kit verify --task T001
visp-kit review --task T001
visp-kit reconcile --task T001 --update-traceability
```

## PR Blocked

Likely cause: verification, review, reconcile, traceability update, or policy gate evidence is missing.

Fix:

```bash
visp-kit gate pr --explain
visp-kit next --explain
```

## JSON Artifact Invalid

Symptom: commands report schema validation errors.

Fix: repair the artifact named in the error, then run:

```bash
visp-kit doctor --check schemas
```

## Review Decision Lock Remains

Symptom: an assurance accept, reject, or repair command reports that another
review decision pointer update is in progress and prints a `.lock` path.

Fix: first confirm that no `visp-kit assurance accept`, `visp-kit assurance reject`, or
`visp-kit assurance repair` process is still running for that task. If none is
running, remove only the exact stale lock entry printed by the error, then retry
the original command. Never remove a broad `.visp/` directory or clear a lock
merely because a live publication is taking longer than expected.

## Package Not Linked Globally

Symptom: `visp` command is not found.

Fix from the Visp Kit repository:

```bash
pnpm run install:global
visp-kit --help
```

Or use a package-style install:

```bash
pnpm build
npm pack
npm install -g ./visp-kit-*.tgz
visp-kit --help
```

For active development, a pnpm link also works:

```bash
pnpm build
pnpm link --global
visp-kit --help
```

Or run directly:

```bash
node dist/index.js --help
```
