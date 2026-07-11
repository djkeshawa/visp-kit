# FAQ

## Does Visp Kit call an LLM?

No. Visp Kit writes deterministic artifacts and prompts. You decide whether to use them with Codex or another tool.

## Does Visp Kit run Codex automatically?

No. It only creates Codex-friendly prompts.

## Should `.visp/` be committed?

For team auditability, yes. For private experiments, you can keep it local. The project should decide.

## Is Visp Kit only for TypeScript?

No. Visp Kit supports JavaScript, TypeScript, Electron, React, Node API, Go, Java, Python, Rust, and generic presets. It auto-detects common manifests when `--preset` is omitted.

## Can I use it with Copilot or Claude Code?

Yes. The prompts are Markdown files and the artifacts are local JSON/Markdown.

## What if context is over budget?

Run `visp budget` and split the task, reduce file scope, or use a smaller budget mode.

A context pack is flagged over budget when its estimated input tokens exceed the
budget-mode limit plus the policy's tolerance. The tolerance is
`policy.limits.maxContextOverBudgetPercent`, so the effective cutoff is
`maxInputTokens * (1 + maxContextOverBudgetPercent / 100)`. Defaults are 50%
(relaxed), 25% (standard), 20% (strict), and 0% (locked) — in locked mode any
excess over the limit is over budget, and the locked-mode gate blocks
implementation until the pack fits.

## What if verification passes but review warns?

Warnings are not always blockers. Read the review report and decide whether to fix, accept, or reconcile with warnings.
