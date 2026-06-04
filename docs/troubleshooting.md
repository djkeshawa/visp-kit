# Troubleshooting

Start with:

```bash
visp doctor
visp next --explain
visp gate next --explain
```

## `.visp/` Is Missing

Run:

```bash
visp init
```

## No Active Feature

Run:

```bash
visp feature "Describe your feature"
```

## Scan Cache Is Missing

Run:

```bash
visp scan
```

If the repository changed significantly:

```bash
visp scan --changed
```

## Constitution Is Missing

Run:

```bash
visp constitution
```

## Context Command Cannot Find A Task

Check available tasks:

```bash
visp status --verbose
```

Then run:

```bash
visp context T001
```

## Policy Is Missing Or Invalid

Run:

```bash
visp policy validate
```

If `.visp/policy.json` is missing:

```bash
visp policy init --strictness strict
```

`visp doctor --fix` can safely create a missing policy file. It does not overwrite an existing policy.

## A Gate Blocks The Workflow

Run the gate with explanation:

```bash
visp gate <stage> --task T001 --explain
```

Follow the `Next allowed command` in the gate output. A user prompt is raw intent only and cannot override a failed Visp gate.

## Agent Workflow Files Are Missing

Run:

```bash
visp agent doctor --target codex
visp agent doctor --target claude
visp agent doctor --target copilot
```

Refresh generated files when needed:

```bash
visp agent refresh --target all --force
```

Claude and Copilot compatibility depends on the active tool surface. If the tool does not load repository instruction files automatically, copy the generated Visp instructions into the active chat/session.

## Verification Fails

Read:

```text
.visp/features/<feature>/verification.md
```

Common causes:

- validation command failed
- changed file is outside task scope
- forbidden file changed
- dependency file changed without approval
- broken artifact JSON

## Review Fails

Read:

```text
.visp/features/<feature>/review/T001.review.md
```

Fix blocking findings, then run:

```bash
visp verify --task T001
visp review --task T001
```

## Reconcile Fails

Read:

```text
.visp/features/<feature>/reconcile/T001.reconcile.md
```

Fix drift, missing evidence, or mapping issues, then run:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001
```

## JSON Output Has Extra Text

Use the command-specific `--json` flag. If extra text appears, that is a bug.

## Package Manager Warning

Visp Kit requires Node.js 24+ and pnpm 11+. If you see an engine warning, switch to Node.js 24 or newer.
