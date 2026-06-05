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
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
visp scan
visp constitution
visp policy validate
visp feature "Add note pinning"
visp clarify
visp spec
visp plan
visp tasks
visp context --next
visp gate implement --task T001
```

Then use the generated agent workflow.

For Codex:

```text
$visp-task
Continue with the next Visp task.
```

After implementation:

```bash
visp verify --task T001
visp review --task T001
visp reconcile --task T001 --update-traceability
visp pr
```

## Override Example

Use overrides only when a human intentionally accepts a policy exception:

```bash
visp override create VSP014 \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Example fixture records manual verification for this temporary task."
visp override validate
```
