# Strict Agent Workflow Example

This is a small fixture for trying the strict Visp Kit workflow.

It is intentionally simple:

- no app framework
- no external test framework
- no AI provider calls
- one source file
- one node-based test script

## Install

```bash
pnpm install
```

## Test

```bash
pnpm test
```

## Try Visp Kit

From this example directory, after building and linking Visp Kit:

```bash
visp-kit agent bootstrap codex --preset typescript --budget lean --strictness strict
visp-kit scan
visp-kit constitution
visp-kit policy validate
visp-kit feature "Add note pinning"
visp-kit clarify
visp-kit spec
visp-kit plan
visp-kit tasks
visp-kit context --next
visp-kit gate implement --task T001
```

Then use the generated agent workflow.

For Codex:

```text
$visp-task
Continue with the next Visp task.
```

After implementation:

```bash
visp-kit verify --task T001
visp-kit review --task T001
visp-kit reconcile --task T001 --update-traceability
visp-kit pr
```

## Override Example

Use overrides only when a human intentionally accepts a policy exception:

```bash
visp-kit override create VSP014 \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Example fixture records manual verification for this temporary task."
visp-kit override validate
```
