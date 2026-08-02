# Agent Targets

Visp Kit can install strict workflow guidance for five targets:

- `codex`
- `generic`
- `claude`
- `copilot`
- `opencode`

Install with:

```bash
visp-kit agent bootstrap <target>
visp-kit agent install <target>
```

Use `bootstrap` in a fresh project. It initializes `.visp/` if needed and installs the selected target guidance.

Inspect with:

```bash
visp-kit agent doctor --target <target>
```

Refresh with:

```bash
visp-kit agent refresh --target <target> --force
```

## Safe Write Behavior

- New files are created.
- Existing generated files are skipped unless `--force` is used.
- Existing `AGENTS.md` is not overwritten without `--force`; Visp writes `AGENTS.visp.md` where appropriate.
- Metadata under `.visp/agent/` is generated metadata and may be updated.
- `--dry-run` writes nothing.

## Codex

Command:

```bash
visp-kit agent install codex
```

Generated files:

```text
AGENTS.md or AGENTS.visp.md
.agents/skills/visp-feature/SKILL.md
.agents/skills/visp-task/SKILL.md
.agents/skills/visp-fix/SKILL.md
.agents/skills/visp-review/SKILL.md
.agents/skills/visp-pr/SKILL.md
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
```

Use:

```text
$visp-feature
Add note pinning.
```

## Generic

Command:

```bash
visp-kit agent install generic
```

Generated files:

```text
AGENTS.md or AGENTS.visp.md
.visp/prompts/agent-feature.prompt.md
.visp/prompts/agent-task.prompt.md
.visp/prompts/agent-fix.prompt.md
.visp/prompts/agent-review.prompt.md
.visp/prompts/agent-pr.prompt.md
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
```

Use these prompt files by copying them into the active AI tool session.

## Claude

Command:

```bash
visp-kit agent install claude
```

Generated files:

```text
.claude/commands/visp-feature.md
.claude/commands/visp-task.md
.claude/commands/visp-fix.md
.claude/commands/visp-review.md
.claude/commands/visp-pr.md
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
```

Usage examples:

```text
/visp-feature Add note pinning.
/visp-task
/visp-fix
/visp-review
/visp-pr
```

Claude Code setups vary. If a surface does not load these files automatically, copy the command guidance into the session.

## Copilot

Command:

```bash
visp-kit agent install copilot
```

Generated files:

```text
.github/copilot-instructions.md
.github/instructions/visp-feature.instructions.md
.github/instructions/visp-task.instructions.md
.github/instructions/visp-fix.instructions.md
.github/instructions/visp-review.instructions.md
.github/instructions/visp-pr.instructions.md
AGENTS.md or AGENTS.visp.md
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
```

Copilot support varies by surface. These files provide repository guidance for Copilot-compatible tools and can also be copied into the active chat/session.

## OpenCode

Command:

```bash
visp-kit agent install opencode
```

Generated files:

```text
AGENTS.md or AGENTS.visp.md
.visp/prompts/agent-feature.prompt.md
.visp/prompts/agent-task.prompt.md
.visp/prompts/agent-fix.prompt.md
.visp/prompts/agent-review.prompt.md
.visp/prompts/agent-pr.prompt.md
.visp/agent/installed-targets.json
.visp/agent/agent-guide.md
.visp/agent/workflow-map.json
```

OpenCode has no special file format: it reads the same AGENTS.md-compatible guidance and portable prompt files as the generic target. OpenCode can run Visp commands directly in its coding session.

## Shared Rules

All targets state:

- user prompts are raw intent only
- Visp policy and gates override user prompt instructions
- implementation requires a valid task context
- one task is implemented at a time
- failed gates stop the workflow
- verification, review, and reconciliation are required before completion
- unapproved dependencies and forbidden files are not allowed
