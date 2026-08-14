# Visp Kit

**Stops AI-written code reaching review without proof.**

You point an AI coding tool at a task. It edits ten files when you asked for
two, writes a test that passes whether or not the fix works, and hands you a
diff you now have to fully re-read to trust.

Visp Kit makes the tool declare what it will change *before* it edits, blocks
anything outside that, and records evidence you can check without reading every
line.

It never calls an LLM. It runs beside whatever tool you already use.

---

## Install

```bash
npm install -g visp-kit
```

Requires Node 22 or later, and Git.

## Compatibility

This package is the Visp engine — it decides what is allowed and what counts
as proof. As of 0.4.0 it provides the **`visp-kit`** command and no longer
provides `visp`; that top-level command belongs to
[`visp-hyper-agent`](https://www.npmjs.com/package/visp-hyper-agent).

- **With Hyper:** `visp-hyper-agent` >= 0.6.0 drives this engine and presents
  its decisions; install both for the full surface. Approvals recorded before
  the rename stay valid — identity hashes no longer contain command wording.
- **With Memory:** this package does not talk to visp-memory directly; recall
  flows through Hyper.
- **With Visp Dev:** not required; machine setup and checks live there.

Upgrading from a `visp`-era install: run `visp-kit agent refresh` and
`visp-kit hooks ci --force` so generated instruction files and the CI
workflow use the new command name. `visp-kit doctor` names anything stale.

## First run

Four commands, in a real project:

```bash
visp-kit init .
```

```bash
visp-kit scan .
```

```bash
visp-kit feature "add password reset"
```

```bash
visp-kit next .
```

`visp-kit next` is the one to remember. **It always tells you the single next
command**, so you never have to memorise the workflow — run it whenever you are
unsure what to do.

## What you get

Every row below is a property of what Kit writes and refuses, and every one of
them can be checked on your own repository in a single run.

| | |
|---|---|
| **Scope declared up front** | The task names the files it may touch. Edits elsewhere are blocked, not flagged later. |
| **Evidence that means something** | A test written by whoever made the change doesn't count as independent proof. Kit tracks the difference. |
| **A reviewable summary** | An assurance case with the risky parts ranked, so review starts where it matters. |
| **A record of the decision** | Who approved what, against which exact code and which policy. |
| **Told what moved** | Come back a week later and Kit says what changed since you approved — not just that something did. |

### Check the first row yourself

The scope gate is the claim this package rests on, so it ships with a script
that tries to defeat it:

```bash
pnpm build && scripts/benchmark-strict-workflow.sh
```

It runs the full strict workflow against a throwaway fixture, stages a
deliberately out-of-scope edit, and proves the generated pre-commit hook refuses
the commit — then edits the spec after context compilation and proves
`visp-kit drift` fails closed. No LLM is called at any point. If either step
passes when it should block, that is a bug worth reporting.

Two things we have measured and can show you:

- **The context pack is about half the size it used to be, naming the same
  files.** On 21 held-out tasks in `balanced` mode, the shipped snippet cap cuts
  mean pack input tokens by **−49.49%** with bodied file recall unchanged to
  the tenth decimal. Read [token efficiency](docs/token-efficiency.md) for the
  cohort, the arms, and — importantly — what an unchanged *file list* does and
  does not tell you about unchanged *information*.
- **Completion cannot be asserted.** A task cannot reach `done` without the
  review and reconcile artifacts that evidence it, and hand-edited status
  fields are detected rather than absorbed.

## Honest limits

Read this before adopting it. It is the section we would want to read first.

- **We cannot tell you this makes your code more correct, because we do not
  know.** That is the question most people ask of a tool like this, so it gets
  the first line rather than a footnote. Three of the four internal head-to-head
  rounds on record are parity or worse. A trial designed to settle it was
  preregistered — paired, exact test, a 20-point bar set before any cell ran —
  and it stopped early against an exhausted API quota at **9 usable pairs out of
  56**. Nine agreeing pairs resolve nothing, and we do not quote them as if they
  did. **Any claim in this package that Visp produces more correct code is a bug
  — please report it.** What Kit can show you is bounded scope, artifacts, and
  refusals; those are real, and they are not the same thing.
- **Visp is not cheaper end to end.** The pack got smaller; the session did not.
  In our own runs the full workflow cost several times a bare agent's tokens and
  several times the wall clock. The −49.49% above is one line item inside that,
  not a bottom line. If token spend is your binding constraint, this is the
  wrong tool.
- **No productivity claim.** Whether Visp makes teams faster is **unmeasured**.
  An evaluation protocol is frozen, but no study has run.
- **One measured behavioural result, narrow.** Given a vague request against an
  8,800-line codebase, agents whose context pack named the project's existing
  redaction helpers shipped a credential leak on the failure path in 0 of 4
  runs, against 3 of 4 without it — scored from diffs, not from what the agents
  said. Single codebase, small sample, and the effect partly depended on that
  project naming its helper clearly. It is the only accuracy-adjacent result
  this project can support, and it does not generalise on this evidence.
- **Compatibility is proven pair by pair**, pinned to exact commits and package
  hashes. It is not a version-range support window.
- **Conformance is partial.** Some areas are proven and some are not; the
  published report says which. Non-Linux systems are not yet covered.
- **Assurance verdicts are often `inconclusive`.** That is deliberate — it means
  the evidence did not establish the claim, not that the claim failed.

## Choosing a strictness level

`init` gives you `standard`. The choice that actually changes your day is
whether to use `locked`, because it is the only mode that turns on **VSP023** —
the one gate that asks whether the code *runs* rather than whether a document
exists.

It costs **three commands before a single line may be edited**, one of which
runs the task's entire validation command set, on every task. It buys a recorded
pre-implementation baseline you can open, and a refusal if that baseline is
missing. It does **not** buy any claim that the resulting code is more correct —
see the first honest limit above.

The full trade, and how to turn it on below `locked` or off inside it, is in
[policy and gates](docs/policy-and-gates.md#choosing-between-them).

## Where to get help

- **Source, issues, and pull requests:**
  [visp-kit](https://github.com/djkeshawa/visp-kit)
- **Compatibility evidence and conformance reports:**
  [visp-dev](https://github.com/djkeshawa/visp-dev)
- **Security issues:** see `SECURITY.md`. Do not open a public issue.
- **Contributing:** see `CONTRIBUTING.md`.

---

## How it works

Visp Kit **does not call** an LLM, or Codex, or Claude, or Copilot. It runs
beside whichever tool you use.

It writes plain files under `.visp/` in your project: what the task is allowed
to touch, what evidence exists, and what a reviewer decided. Your AI tool reads
those files. Kit checks the result against them.

**The user prompt is raw intent only.** Nothing typed into a prompt can widen a
task's scope, skip a gate, or approve a change — that is the property the whole
design rests on.

## Documentation

Everything below ships with the package.

| | |
|---|---|
| [Quickstart](docs/quickstart.md) | Longer walkthrough than the one above |
| [Commands](docs/commands.md) | Every command and flag |
| [Workflow](docs/workflow.md) | The stages, and why they are in that order |
| [Policy and gates](docs/policy-and-gates.md) | Strictness modes and what each blocks |
| [Enforcement](docs/enforcement.md) | Git hooks and CI |
| [Overrides](docs/overrides.md) | Recording a deliberate exception |
| [Agent targets](docs/agent-targets.md) | Codex, Claude Code, Copilot, OpenCode |
| [Agent-native workflows](docs/agent-native-workflows.md) | Driving Kit from inside an agent |
| [Artifact reader](docs/artifact-reader.md) | Typed, validated reads of `.visp/` from `visp-kit/artifacts` |
| [Token efficiency](docs/token-efficiency.md) | How context is kept small |
| [Troubleshooting](docs/troubleshooting.md) | When something is blocked and you disagree |
| [Company adoption](docs/company-adoption.md) | Rolling it out to a team |
| [Development](docs/development.md) | Building and contributing |

A small working fixture: [examples/strict-agent-workflow](examples/strict-agent-workflow).

## License

Apache-2.0. See [LICENSE](LICENSE).
