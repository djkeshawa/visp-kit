// P13-US-04 — what Kit tells the world to run.
//
// Kit's gate answers carry commands that agents, Hyper's composite loop, and
// the generated hooks execute. Since the D-118 rename, `visp` is HYPER's
// binary and `visp-kit` is the engine — so a Kit-emitted `visp spec` names a
// command no installed binary answers to.
//
// `visp plan` is the one that does not even fail loudly: `plan` IS one of
// Hyper's thirteen verbs, but it means "drive the entire preparation loop",
// not "run Kit's plan stage". Same words, different program.
//
// This is asserted as a PROPERTY over every stage rather than as a list of
// expected strings. A test that pinned the literals would pass while a stage
// added next year reintroduced the bug — which is how `feature`, `context`
// and `reconcile` came to be fixed during the rename while `spec`, `plan`,
// `tasks`, `verify`, `review` and `pr` were missed.

import { describe, expect, it } from "vitest";

import { gateStageSchema, type GateStage } from "../../../src/artifacts/schemas/gate.schema.js";
import { createCli } from "../../../src/cli/main.js";
import { commandForStage } from "../../../src/gates/gate-result.js";
import { readyCommand, readyCommandBare } from "../../../src/gates/stage-checks.js";
import {
  formatTemplateWorkflowSummary,
  type TemplateCommandName,
  type TemplateWorkflowOutcome,
  type TemplateWorkflowSummary
} from "../../../src/workflows/shared/workflow-summary.js";
import { type Task } from "../../../src/artifacts/schemas/task.schema.js";

const ALL_STAGES: readonly GateStage[] = gateStageSchema.options;

/**
 * Kit's real subcommands, read from the CLI rather than from a list kept
 * alongside it. Renaming the binary correctly is only half the property: the
 * SUBCOMMAND has to exist too.
 *
 * This caught a live mistake while the fix above was being written. `setup` is
 * a gate stage but not a Kit command, so mechanically rewriting `visp setup`
 * to `visp-kit setup` invented a command nobody implements — and the old
 * string had been accidentally valid, because `setup` is one of Hyper's verbs.
 * A test that only checked the binary name would have called that a pass.
 */
const KIT_COMMANDS: ReadonlySet<string> = new Set(
  createCli({ writeOut: () => undefined }).commands.map((command) => command.name())
);

const task = {
  id: "T001",
  title: "Implement the thing",
  description: "Implement the thing.",
  requirementIds: ["REQ001"],
  acceptanceCriterionIds: ["AC001"],
  dependsOn: [],
  allowedFiles: ["src/thing.ts"],
  expectedFiles: [],
  forbiddenFiles: [],
  validationCommands: ["pnpm test"],
  status: "ready",
  parallelizable: false,
  riskLevel: "medium"
} as unknown as Task;

/**
 * Kit only ever recommends its own commands. Anything that looks runnable —
 * begins with a `visp`-family binary name — must name `visp-kit` exactly.
 * Prose ("Read .visp/prompts/…") is not a command and is left alone.
 */
function assertNamesKit(value: string, where: string): void {
  if (!/^visp/u.test(value)) return; // prose, not a command
  expect(
    value,
    `${where} emits "${value}". Since the rename, \`visp\` is visp-hyper-agent's binary and does ` +
      "not accept Kit's stage names, so this command cannot run. Emit visp-kit."
  ).toMatch(/^visp-kit\s/u);

  // Naming the right binary is not enough — the subcommand has to exist.
  const subcommand = value.split(/\s+/u)[1];
  expect(
    KIT_COMMANDS.has(subcommand ?? ""),
    `${where} emits "${value}", but visp-kit has no "${subcommand}" command. ` +
      `Available: ${[...KIT_COMMANDS].sort().join(", ")}.`
  ).toBe(true);
}

describe("every command Kit emits names Kit's own binary", () => {
  it("covers every gate stage the schema defines", () => {
    // Guards the guard: if stages are added and this list is derived from a
    // stale copy, the property below silently stops covering them.
    expect(ALL_STAGES.length).toBeGreaterThan(0);
    expect(ALL_STAGES).toContain("spec");
    expect(ALL_STAGES).toContain("plan");
    expect(ALL_STAGES).toContain("implement");
  });

  it.each([...ALL_STAGES])("readyCommand(%s) names visp-kit", (stage) => {
    assertNamesKit(readyCommand(stage, undefined), `readyCommand(${stage})`);
    assertNamesKit(readyCommand(stage, task), `readyCommand(${stage}, task)`);
  });

  it.each([...ALL_STAGES])("readyCommandBare(%s) names visp-kit", (stage) => {
    assertNamesKit(readyCommandBare(stage, undefined), `readyCommandBare(${stage})`);
    assertNamesKit(readyCommandBare(stage, task), `readyCommandBare(${stage}, task)`);
  });

  it.each([...ALL_STAGES])("commandForStage(%s) names visp-kit", (stage) => {
    assertNamesKit(commandForStage(stage), `commandForStage(${stage})`);
  });

  // -------------------------------------------------------------------
  // The gate is not the only thing that prints commands.
  //
  // Dogfooding on a real repository found `visp clarify --validate` coming
  // out of the workflow summary renderer, minutes after the gate surface was
  // fixed and pinned. `visp clarify` answers "error: unknown command".
  //
  // The tests above were scoped to the GATE, when the property is Kit's:
  // every command Kit prints names visp-kit. A property test scoped to one
  // caller only proves that caller, which is the same mistake as a check that
  // passes for a reason other than the thing it names.
  // -------------------------------------------------------------------
  const TEMPLATE_COMMANDS: readonly TemplateCommandName[] = ["clarify", "spec", "plan", "tasks"];

  function summaryFor(
    command: TemplateCommandName,
    outcome: TemplateWorkflowOutcome
  ): TemplateWorkflowSummary {
    const passed = outcome === "passed";
    return {
      success: outcome !== "failed",
      outcome,
      command,
      targetPath: "/tmp/project",
      feature: { id: "001", slug: "a-feature", path: ".visp/features/001-a-feature" },
      createdFiles: [".visp/features/001-a-feature/clarifications.json"],
      skippedFiles: [],
      staleFiles: [],
      overwrittenFiles: [],
      updatedFiles: [],
      validated: true,
      validation: { passed, errors: passed ? [] : ["CQ001 contains placeholder text."] },
      dryRun: false,
      promptPath: ".visp/prompts/clarify.prompt.md",
      warnings: [],
      nextCommand: readyCommandBare("spec", undefined)
    };
  }

  it.each(
    TEMPLATE_COMMANDS
  )("the %s workflow summary emits only runnable visp-kit commands", (command) => {
    // "draft" is included because it is the outcome the generation path always
    // produces, and it renders its own next-step block.
    for (const outcome of ["passed", "failed", "draft"] as const) {
      const rendered = formatTemplateWorkflowSummary(summaryFor(command, outcome));
      for (const line of rendered.split("\n").map((value) => value.trim())) {
        assertNamesKit(line, `${command} summary (outcome ${outcome})`);
      }
    }
  });

  it("never emits a bare `visp` command for the stages the rename missed", () => {
    // The specific regression, spelled out. These six were reported by the
    // capability audit; keeping them named makes the failure legible.
    for (const stage of ["spec", "plan", "tasks", "verify", "review", "pr"] as GateStage[]) {
      expect(readyCommand(stage, task).startsWith("visp ")).toBe(false);
      expect(commandForStage(stage).startsWith("visp ")).toBe(false);
    }
  });
});
