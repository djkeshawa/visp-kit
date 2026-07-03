# Enforcement

Visp gates are advisory for agents that choose to run them. Enforcement hooks
make them mechanical: edits and commits are checked against the implement
authorization that `visp gate implement` writes, without trusting the agent to
cooperate.

Enforcement activates when `.visp/policy.json` strictness is `strict` or
`locked`. In `standard` mode the git hook warns instead of blocking; in
`relaxed` mode hooks stay silent.

## How authorization works

1. `visp gate implement --task <task-id>` writes a per-task marker under
   `.visp/state/implement-allowed/<task-id>.json` when the gate allows
   implementation (plus the legacy `.visp/state/implement-allowed.json` so
   hooks generated before per-task markers keep enforcing — upgrade with
   `visp hooks claude|git --force`). Each marker records the task ID and its
   allowed, expected, and forbidden files.
2. Hooks read every active marker locally. A file is editable when any active
   task allows it and no active task forbids it (forbidden wins). Hooks never
   call the network.
3. `visp done --task <task-id>` clears that task's marker when every step
   passes. A blocked implement gate clears only the blocked task's marker.

## Parallel tasks

Multiple tasks can hold implement authorizations at the same time, which lets
orchestrators fan agents out over parallelizable tasks:

- The implement gate blocks a second task whose allowed/expected files overlap
  an active authorization (error in `strict`/`locked`, warning otherwise), and
  warns when a non-`parallelizable` task is authorized while others are
  active.
- Markers are per-checkout state. Each git worktree has its own
  `.visp/state/`, so agents working in separate worktrees never share or
  clobber authorizations. Add `.visp/state/` to `.gitignore` if you commit the
  rest of `.visp/` — markers are ephemeral authorization, not audit evidence
  (`.visp/runs/` and `.visp/reports/` are the audit trail).

## Claude Code PreToolUse hook

Blocks Edit/Write tool calls before the implement gate has allowed
implementation, and blocks edits outside the task's allowed files.

```bash
visp hooks claude
```

This writes `.visp/hooks/claude-pretooluse.mjs` and prints a snippet to merge
into `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit|NotebookEdit",
        "hooks": [
          {
            "type": "command",
            "command": "node .visp/hooks/claude-pretooluse.mjs"
          }
        ]
      }
    ]
  }
}
```

Visp Kit does not edit `.claude/settings.json` itself; merging the snippet is
an explicit user step. `visp agent install claude` also ships the hook script
so the snippet is the only manual step.

Edits under `.visp/` are always allowed so the agent can update checklists and
artifacts.

## Git pre-commit hook

Checks staged source files against the active implement authorization:

```bash
visp hooks git
```

This writes `.visp/hooks/visp-pre-commit.mjs` and installs a
`.git/hooks/pre-commit` wrapper. If a pre-commit hook from another tool
already exists, Visp leaves it alone and prints the line to add manually
(or rerun with `--force` to overwrite).

Behavior by strictness:

- `strict` / `locked`: block commits whose staged source files have no
  implement authorization or fall outside the task scope
- `standard`: print a warning, allow the commit
- `relaxed`: silent

## CI evidence check

Generates a GitHub Actions workflow that validates policy and the PR gate on
every pull request:

```bash
visp hooks ci
```

The workflow (`.github/workflows/visp-evidence.yml`) runs:

```bash
visp policy validate --json
visp gate pr --json
```

A blocked PR gate fails the check, so a pull request cannot merge green
without verification, review, and reconciliation evidence.

## Scope and limits

- Hooks enforce file scope and gate order. They do not review code quality.
- The Claude hook covers Edit/Write-style tools; an agent shelling out with
  Bash can still bypass it. The pre-commit and CI checks are the backstops.
- All checks are local and deterministic; nothing leaves the machine.
