# Company Adoption

Visp Kit is designed for teams that need AI assistance without losing scope control, auditability, or token discipline.

## Why Teams Use It

- Keep implementation tied to requirements.
- Reduce token usage with task-specific context packs.
- Avoid sending whole repositories to agents.
- Create auditable local artifacts.
- Run deterministic gates before human review.
- Make PR summaries factual and evidence-based.

## Recommended Team Policy

1. Run `visp scan` before planning.
2. Use `lean` budget by default.
3. Require `allowedFiles` for implementation tasks.
4. Require acceptance criteria for behavior-changing tasks.
5. Run `visp verify`, `visp review`, and `visp reconcile` before PR.
6. Treat dependency changes as explicit task scope.
7. Keep `.visp/` artifacts in the repository when auditability matters.

## Security And Privacy

Visp Kit does not call LLM providers. It writes local artifacts and prompts. Teams can decide which prompts or context packs are sent to an external tool.

Review generated context before use when working with:

- secrets
- personal data
- authentication
- authorization
- payments
- regulated systems
- proprietary algorithms

## Token Budgets

Suggested defaults:

- Product feature: `lean`
- Cross-module feature: `balanced`
- Security-sensitive or data migration task: `strict`

Use:

```bash
visp budget --feature <feature>
visp budget --task T001
```

## Audit Trail

Useful artifacts for audit:

- `spec.json`
- `task-graph.json`
- `traceability.json`
- `context/T001.context.json`
- `verification.json`
- `review/T001.review.json`
- `reconcile/T001.reconcile.json`
- `pr.json`

## Rollout Plan

1. Start with one TypeScript project.
2. Keep `.visp/` committed for one feature.
3. Compare PR quality and review time.
4. Standardize budget and task-scope rules.
5. Add team-specific constitution rules.
6. Extend usage to more repositories.
