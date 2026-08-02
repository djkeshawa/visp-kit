# Configuration

Visp Kit configuration lives in `.visp/config.json`.

## Presets

Supported presets:

- `javascript`
- `typescript`
- `electron`
- `react`
- `node-api`
- `go`
- `java`
- `python`
- `rust`
- `generic`

Example:

```bash
visp-kit init --preset typescript
visp-kit constitution --preset typescript
```

If `--preset` is omitted during `visp-kit init` or `visp-kit agent bootstrap`, Visp Kit auto-detects a preset from project manifests such as `package.json`, `go.mod`, `pom.xml`, `pyproject.toml`, or `Cargo.toml`.

Use `--preset generic` to force generic behavior.

## Budget Modes

Supported budget modes:

- `lean`
- `balanced`
- `strict`

Example:

```bash
visp-kit init --budget lean
visp-kit context T001 --budget balanced
```

## Strictness Modes

Strictness is stored in `.visp/policy.json`.

- `relaxed`
- `standard`
- `strict`
- `locked`

Example:

```bash
visp-kit init --strictness strict
visp-kit policy set-strictness locked
visp-kit policy validate
```

Budget mode controls context size. Strictness controls workflow enforcement.

## Agent Modes

`visp-kit init --agent` supports starter guidance modes:

- `generic`
- `codex`
- `none`

Example:

```bash
visp-kit init --agent codex
```

`codex` creates Codex-oriented guidance where safe. `none` creates no agent guidance files.

For full native workflow packs, use the agent installer after init:

```bash
visp-kit agent bootstrap codex
visp-kit agent install codex
visp-kit agent install generic
visp-kit agent install claude
visp-kit agent install copilot
```

Claude and Copilot support varies by AI tool surface. Generated files are strict repository guidance and can also be copied into the active session.

## Overrides

Overrides live in `.visp/overrides.json` and are managed with:

```bash
visp-kit override create VSP014 --scope project --reason "Manual validation is documented for this temporary alpha task."
visp-kit override validate
```

Overrides require meaningful reasons. `VSP019` and `VSP020` are non-overridable.

Project policy may set `assurance.profile` to `routine`, `behavioral`, or
`critical`. The setting can raise Kit's calculated task profile. A lower value
does not silently weaken assurance: create a scoped `VSP022` override with a
human reason if the exception is intentional.

## Feature And Task Selection

Most commands use the active feature from `.visp/status.json`.

Override it with:

```bash
visp-kit status --feature 001-add-note-pinning
visp-kit context T001 --feature add-note-pinning
```

Task-specific commands accept:

```bash
--task T001
```

or positional task IDs where supported:

```bash
visp-kit context T001
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
