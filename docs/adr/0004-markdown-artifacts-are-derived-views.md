# ADR 0004: Feature Markdown Is a Derived View, Never an Authored Document

- **Status:** Accepted
- **Date:** 2026-08-01
- **Accepted:** 2026-08-01
- **Workspace decision:** D-105

## Context

Every stage of the feature workflow writes a pair: a `.json` artifact and a `.md`
beside it. `spec.json` and `spec.md`, `plan.json` and `plan.md`, `task-graph.json`
and `tasks.md`, `clarifications.json` and `clarifications.md`,
`traceability.json` and `traceability.md`.

The JSON is validated hard. It is parsed against a Zod schema, then run through a
semantic validator that rejects placeholder text, unresolved blocking questions,
acceptance criteria that restate their requirement, and traceability that does not
cover every task. Failing any of it blocks the workflow.

The markdown was validated by `validateTextExists`, which returns an error only
when the file is missing or unreadable. It never looked at the content.

That asymmetry had a consequence nobody intended. The scaffold seeded the markdown
from a placeholder template full of `TBD` and `<requirement title>`, and the prompt
told the agent to update four files while giving concrete mechanics — field enums,
ID formats, a worked example, an explicit instruction not to add or rename fields —
for only the two JSON ones. An agent doing exactly what the prompt specified and
exactly what the gate enforced would fill the JSON and leave the markdown as
scaffolded. Validation reported **passed**. `visp drift` reported no findings. A
human opening `spec.md` to review the specification saw a blank form.

This was reproduced end to end before the fix: a fully populated `spec.json`, a
`spec.md` never touched, `visp spec --validate` reporting passed, seventeen
placeholder markers still on disk, `Status: draft` in the markdown against
`"ready"` in the JSON, and one acceptance criterion missing from the markdown
entirely.

Two smaller defects sat underneath the same asymmetry. The scaffold's own pair was
inconsistent from the first write — the markdown hardcoded `Status: draft` while
the JSON it accompanied was seeded `draft_invalid`. And two different exported
functions were both named `renderTraceabilityMarkdown`, in
`templates/phase7-templates.ts` and `reconcile/reconcile-traceability.ts`, writing
the same file with incompatible column sets. The shape of `traceability.md`
depended on which command had run last.

The obvious fix — lint the markdown for placeholder text — treats the symptom. It
also fails on its own terms: the existing derived renderers legitimately emit
`TBD` as an empty-value fallback, so the lint would reject its own precedent's
output.

## Decision

**Feature markdown is a projection of the validated artifact. It is generated, not
written.**

Concretely:

1. Every feature `.md` is rendered from its validated `.json` by a
   `render*FromArtifact({ feature, artifact })` function. The `ActiveFeature` half
   is not optional — the document titles, `## Source Intent` and plan's `## Inputs`
   have no backing schema field.
2. The projection is written on the **validate** path, not only at scaffold time,
   through a `derivedFiles` channel on `completeTemplateWorkflow`. It runs inside
   the existing `validation.passed && !dryRun && !promptOnly` guard, so a
   schema-failing artifact produces no render, and dry-run and prompt-only stay
   non-writing.
3. Renderers are **pure functions of `(feature, artifact)`**. No `now` parameter,
   no `Date`, no artifact timestamp echoed into output. `writeGeneratedFiles`
   byte-compares planned against current, so any time source would make every
   unchanged file report stale.
4. Renderers **never throw**. Twenty-three test files reach the workflow through a
   shared fixture that fails on a nonzero exit, so a render throw would fail all of
   them far from its cause. Optional fields degrade; a dependency cycle degrades to
   input order rather than looping.
5. There is **one** canonical traceability renderer, covering all eight
   `traceabilityEntrySchema` fields, with no `Updated:` line.
6. The prompts stop asking for what is generated. The `.md` paths move out of
   `Update:` into a `Generated (do not edit):` block, with one rule line stating
   that edits to them are discarded.

`validateTextExists` stays. It is still a correct, cheap check that the file
exists; content is now guaranteed by construction, so there is nothing left for it
to miss.

**What stays hand-authored:** `traceability.json` remains under `Update:` for
`visp tasks`. The command reads and validates it but does not regenerate it, and
missing task coverage is a hard error — so listing it as generated would forbid the
one edit that clears the failure.

**Not done, deliberately:** no schema changed. Not one field was added, removed, or
relaxed. Sections with no backing field were dropped as dead text rather than given
schema support — spec's `## Clarification Summary` (always literally `- TBD`), its
`## Traceability Seed` table (whose `Notes` column had no backing field anywhere and
which duplicated `traceability.md`), and plan's `## Architecture Summary` (which
`implementationApproach` already carries).

## Consequences

- The markdown and the JSON cannot disagree. The defect class is closed by
  construction rather than by a check that has to keep catching it.
- **The agent writes half as many files.** Four became two for `visp spec`. This is
  the part that matters most for weaker models, which is where the defect surfaced:
  the work that is specified is now the same work that is enforced.
- Fields the markdown previously hid now appear — `dependencies.notes`,
  `dependencies.requiresApproval`, `requirementIds` on risks and decisions,
  per-requirement assumptions and out-of-scope, `taskClass`, `riskFactors`, and all
  eight traceability fields. `Status` is read from the artifact instead of
  hardcoded, so the day-one scaffold inconsistency is gone.
- Hand edits to a generated file are silently discarded on the next validate. This
  is correct for the agent loop and is now stated in the prompt. It does mean a
  human edit is lost without a warning; if that becomes a problem, report divergence
  as a finding rather than reverting the decision.
- `visp reconcile --update-task-status` re-renders `tasks.md` after rewriting the
  task graph. Without that, it would desynchronize the pair immediately after
  `visp tasks --validate` synchronized it.
- Feature markdown is added to the review scope allowlist. These are tool-owned
  paths; without the entry, regenerating them surfaces as `scope` findings in
  `visp review`. `traceability.md` was already exposed to this and is fixed in
  passing.
- `traceability.md` changes shape once, to the canonical layout. No test asserted
  its layout and nothing in `src/` reads its content.
- **The write surface grew.** The validate path now rewrites up to two markdown
  files per run, which makes these among the most frequently rewritten artifacts in
  `.visp/`. `writeTextFile` truncates and rewrites in place; Phase 9's P9-01 makes
  that atomic. No concurrent reader exists yet, so nothing observes it today, but
  P9-01's validation should cover these files.
