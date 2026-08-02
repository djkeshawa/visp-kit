# ADR 0005: Kit Releases the `visp` Binary Name

- **Status:** Accepted
- **Date:** 2026-07-31
- **Accepted:** 2026-08-02 under D-116
- **Workspace decision:** D-106

## Context

Kit's package declares `"bin": { "visp": "dist/index.js" }`. Kit therefore owns the top-level product
name at the command line, and its 31 commands are what `visp <something>` means today.

Hyper ADR 0003 adopts a single thirteen-verb vocabulary spanning Kit, Hyper, and Memory, so a developer
and a coding agent learn one set of words instead of three. That surface has to be called `visp` —
it is the product name, and any other name would add a fourth vocabulary rather than replace three.

Kit cannot both own `visp` and have `visp` mean the unified surface. One of them must move.

The case for Kit keeping it is real: Kit is the engine, it is the authority, and it had the name first.
But the name a user types should describe what they are doing, not which internal layer answers. A
developer running `visp check` does not care that Kit computes the verdict, and — more importantly —
should not have to know that `visp review` is a verdict while `visp-hyper review` is not. Six command
names already collide between the two CLIs (`init`, `next`, `doctor`, `review`, `status`, `hooks`),
and the collision is only reachable because both occupy the same conceptual namespace.

There is a second, quieter argument. `visp-kit/README.md` currently instructs `visp guard .` as one of
five first-run commands. That command does not exist in Kit — `guard` is Hyper's. The quickstart hands
every new user a broken command because two products share one name in the reader's head. Separating
the binaries makes that class of error visible at authoring time.

## Decision

Kit's binary becomes `visp-kit`. The `visp` name is released to the unified verb surface owned by
Hyper (ADR 0003).

Kit's command set, semantics, exit codes, JSON output, and authority are **unchanged**. This is a
rename of the entry point only. `visp-kit next` does exactly what `visp next` did.

Every Kit command remains reachable two ways: directly as `visp-kit <cmd>`, and through the porcelain
escape hatch as `visp kit <cmd>`. Nothing is removed.

Kit continues to own workflow permission, workflow state, task and claim semantics, scope, policy,
evidence sufficiency, verification, review, reconciliation, assurance, and PR-readiness verdicts. The
unified surface dispatches to Kit; it never answers for it. A verb that needs more than one Kit call
routes to Hyper, so no caller other than Hyper sequences Kit commands.

## Consequences

- **Breaking.** Every existing `visp <kit-command>` invocation, script, CI job, and documentation
  example changes. This is cheapest now, before the public alpha; after alpha it breaks real users.
- Kit's agent target renderers change: the installed slash commands and `AGENTS.md` / instruction files
  reference `visp <cmd>` throughout and must be regenerated. Host conformance fixtures pin those
  rendered assets, so all of them re-pin.
- Kit's own docs, README quickstart, prompt templates (`src/prompts/`), and the `nextCommand` strings
  returned by every workflow embed the literal `visp `. `nextCommand` is a contract field consumed by
  Hyper, so this is a coordinated change across both repositories, not a find-and-replace in one.
- Publishing a renamed binary requires a new Kit release and a recorded registry decision. Until it is
  published, the compatibility claim rests on a local build rather than the bytes npm serves.
- The `visp guard` documentation defect disappears as a class: with `visp-kit` and `visp` denoting
  different things, a Hyper command can no longer be mistaken for a Kit one in prose.
- Kit gains nothing functionally. This ADR is a cost Kit pays so the product surface can be coherent;
  the benefit lands on the developer and on the model, not on the engine.

## Alternatives considered

**Keep `visp` for Kit and name the porcelain something else.** Rejected. Any other name means the
product has four vocabularies instead of three, and the collision problem is untouched.

**Alias: `visp` dispatches to Kit for unrecognized verbs.** Rejected. It reintroduces exactly the
ambiguity this removes — `visp review` would silently mean Kit's verdict while `visp check` means the
coordinated path, and a model has no way to know which words are which. A hard split is legible; a
fallback is not.

**Defer until after the public alpha.** Rejected on cost grounds. The rename is free today and
expensive the day after alpha ships. It should land at a phase boundary, with conformance re-pinned in
the same unit of work.
