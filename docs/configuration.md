# Configuration

Visp Kit configuration lives in `.visp/config.json`.

## Presets

Supported presets:

- `javascript`
- `typescript`
- `electron`
- `react`
- `node-api`
- `generic`

Example:

```bash
visp init --preset typescript
visp constitution --preset typescript
```

## Budget Modes

Supported budget modes:

- `lean`
- `balanced`
- `strict`

Example:

```bash
visp init --budget lean
visp context T001 --budget balanced
```

## Agent Modes

`visp init --agent` supports starter guidance modes:

- `generic`
- `codex`
- `none`

Example:

```bash
visp init --agent codex
```

`codex` creates Codex-oriented guidance where safe. `none` creates no agent guidance files.

For full native workflow packs, use the agent installer after init:

```bash
visp agent install codex
visp agent install generic
visp agent install claude
visp agent install copilot
```

Claude and Copilot support varies by AI tool surface. Generated files are strict repository guidance and can also be copied into the active session.

## Feature And Task Selection

Most commands use the active feature from `.visp/status.json`.

Override it with:

```bash
visp status --feature 001-add-note-pinning
visp context T001 --feature add-note-pinning
```

Task-specific commands accept:

```bash
--task T001
```

or positional task IDs where supported:

```bash
visp context T001
```

## JSON Output

Most commands support:

```bash
--json
```

When `--json` is used, Visp Kit prints machine-readable JSON only.

## Dry Run

Commands that write artifacts usually support:

```bash
--dry-run
```

Dry-run mode calculates what would happen without writing files.
