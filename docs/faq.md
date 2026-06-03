# FAQ

## Does Visp Kit call an LLM?

No. Visp Kit writes deterministic artifacts and prompts. You decide whether to use them with Codex or another tool.

## Does Visp Kit run Codex automatically?

No. It only creates Codex-friendly prompts.

## Should `.visp/` be committed?

For team auditability, yes. For private experiments, you can keep it local. The project should decide.

## Is Visp Kit only for TypeScript?

The MVP is strongest for JavaScript and TypeScript projects, but it has generic presets and can scan other text files.

## Can I use it with Copilot or Claude Code?

Yes. The prompts are Markdown files and the artifacts are local JSON/Markdown.

## What if context is over budget?

Run `visp budget` and split the task, reduce file scope, or use a smaller budget mode.

## What if verification passes but review warns?

Warnings are not always blockers. Read the review report and decide whether to fix, accept, or reconcile with warnings.
