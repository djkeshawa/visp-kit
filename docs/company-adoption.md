# Company Adoption

Visp Kit is designed for teams that want AI assistance without losing scope control, auditability, or token discipline.

Recommended pilot default:

```bash
visp agent bootstrap codex --preset typescript --budget lean --strictness strict
```

## Rollout Plan

1. Pilot in one repository.
2. Use `lean` budget and `strict` policy.
3. Run `visp scan` and `visp constitution`.
4. Commit `.visp/policy.json`.
5. Decide which `.visp/` artifacts to commit for auditability.
6. Install or bootstrap the agent target used by the team.
7. Require `visp verify`, `visp review`, and `visp reconcile` before PR.
8. Use overrides only with a recorded reason.
9. Use `visp pr` for factual PR summaries.

## What To Commit

Usually useful:

- `.visp/policy.json`
- `.visp/overrides.json` if overrides are used
- `.visp/memory/constitution.md`
- `.visp/memory/constitution.compact.md`
- `.visp/features/`

Team choice:

- `.visp/cache/`

Commit cache if reproducibility and lower context setup cost matter. Keep it local if the team prefers smaller commits.

## Agent Target Selection

Use the team tool:

```bash
visp agent bootstrap codex
visp agent install codex
visp agent install generic
visp agent install claude
visp agent install copilot
```

Then check:

```bash
visp agent doctor --target codex
```

Use the matching target name for other tools.

## Governance

Visp Kit provides:

- policy-as-code
- deterministic gates
- explicit override artifacts
- traceability from requirements to tasks and files
- verification/review/reconcile evidence
- PR readiness summaries

No silent prompt overrides are allowed. A user prompt can start a workflow, but it cannot bypass policy or failed gates.

## Security And Privacy

Visp Kit does not call LLM providers. It writes local artifacts and prompts. Teams decide what to paste or expose to an AI tool.

Review generated context before using it with external tools when working with:

- secrets
- personal data
- authentication
- authorization
- payments
- regulated systems
- proprietary algorithms

## Overrides

Overrides should be rare and reviewed.

Good override:

```bash
visp override create VSP014 \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Prototype branch has no automated verification yet; manual validation is documented."
```

Bad override:

```text
reason: skip
```

Overrides are visible in gate and readiness reports, so reviewers can decide whether the risk is acceptable.
