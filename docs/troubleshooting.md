# Troubleshooting

Start with:

```bash
visp doctor
visp next --explain
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
