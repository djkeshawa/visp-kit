# Visp outcome evaluation

This directory is an unpublished, non-runtime evaluation harness. It is excluded
from the `visp-kit` package and may invoke model providers through external
runners. The released Visp Kit and Hyper packages remain deterministic and make
no LLM calls.

## Protocol

1. Add 24 fresh tasks conforming to `task.schema.json`: eight TypeScript, eight
   Python, and eight Go tasks, balanced across the four task classes in
   `protocol.json`.
2. Copy `models.lock.example.json` to `models.lock.json` and pin exact provider,
   model, tool, prompt, repository, and parameter versions before any main run.
3. Run the six-task pilot once per model and condition. Do not change primary
   metrics after inspecting pilot outcomes; amend the preregistration instead.
4. Run two fixed seeds for every task/model/condition combination.
5. Write one JSON object per run to `results/runs.jsonl`, matching
   `run-result.schema.json`.
6. Run `node analyze.mjs results/runs.jsonl`. The report uses task-paired
   bootstrap intervals and exact McNemar discordant-pair counts.

The primary outcome is deliberately strict: hidden fail-to-pass tests pass,
pass-to-pass tests do not regress, no forbidden path changes, requirement oracles
are covered, and no human correction occurs before the first checkpoint.

Do not publish accuracy or efficiency claims from this harness unless the rules
in `protocol.json` are met. Negative results are valid results.
