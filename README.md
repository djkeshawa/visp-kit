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

## First run

Five commands, in a real project:

```bash
visp init .
```

```bash
visp scan .
```

```bash
visp feature "add password reset"
```

```bash
visp next .
```

`visp next` is the one to remember. **It always tells you the single next
command**, so you never have to memorise the workflow — run it whenever you are
unsure what to do.

```bash
visp guard .
```

`visp guard` is the check. If the change went outside what the task declared, it
fails here rather than in review.

## What you get

| | |
|---|---|
| **Scope declared up front** | The task names the files it may touch. Edits elsewhere are blocked, not flagged later. |
| **Evidence that means something** | A test written by whoever made the change doesn't count as independent proof. Kit tracks the difference. |
| **A reviewable summary** | An assurance case with the risky parts ranked, so review starts where it matters. |
| **A record of the decision** | Who approved what, against which exact code and which policy. |
| **Told what moved** | Come back a week later and Kit says what changed since you approved — not just that something did. |

## Honest limits

Read this before adopting it:

- **No productivity claim.** Whether Visp makes teams faster or produces better
  software is **unmeasured**. An evaluation protocol is frozen, but no study has
  run. Any claim otherwise is a bug — please report it.
- **Compatibility is proven pair by pair**, pinned to exact commits and package
  hashes. It is not a version-range support window.
- **Conformance is partial.** Some areas are proven and some are not; the
  published report says which. Non-Linux systems are not yet covered.
- **Assurance verdicts are often `inconclusive`.** That is deliberate — it means
  the evidence did not establish the claim, not that the claim failed.

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
| [Token efficiency](docs/token-efficiency.md) | How context is kept small |
| [Troubleshooting](docs/troubleshooting.md) | When something is blocked and you disagree |
| [Company adoption](docs/company-adoption.md) | Rolling it out to a team |
| [Development](docs/development.md) | Building and contributing |

A small working fixture: [examples/strict-agent-workflow](examples/strict-agent-workflow).

## License

Apache-2.0. See [LICENSE](LICENSE).
