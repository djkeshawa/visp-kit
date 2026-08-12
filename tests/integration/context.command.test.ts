import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { pathExists } from "../../src/core/file-system.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function exists(filePath: string): Promise<boolean> {
  return expectOk(await pathExists(filePath));
}

describe("visp-kit context command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-context-command-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates context markdown, JSON, task prompt, and current prompt", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--force"]);

    const contextDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "context");

    expect(output.join("")).toContain("Visp context ready");
    expect(await exists(path.join(contextDir, "T001.context.md"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.context.json"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.prompt.md"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.implementation-checklist.md"))).toBe(true);
    expect(await exists(path.join(contextDir, "T001.implementation-checklist.json"))).toBe(true);
    expect(await exists(path.join(tempDir, ".visp", "prompts", "current-task.prompt.md"))).toBe(
      true
    );

    const contextJson = JSON.parse(
      await readFile(path.join(contextDir, "T001.context.json"), "utf8")
    ) as {
      taskId: string;
      strictnessMode?: string;
      gateStatus?: string;
      policyGate?: { stage: string; allowed: boolean };
      includedRequirements: Array<{ id: string }>;
      includedFiles: Array<{ path: string; includeMode: string }>;
      artifactProvenance: Array<{
        label: string;
        path: string;
        hash: string;
        hashAlgorithm: string;
      }>;
      estimatedTokens: { maxInput: number };
    };
    const currentPrompt = await readFile(
      path.join(tempDir, ".visp", "prompts", "current-task.prompt.md"),
      "utf8"
    );
    const checklistJson = JSON.parse(
      await readFile(path.join(contextDir, "T001.implementation-checklist.json"), "utf8")
    ) as {
      taskId: string;
      items: Array<{ id: string; status: string; required: boolean }>;
    };
    const budgetReport = await readFile(
      path.join(tempDir, ".visp", "reports", "budget-report.md"),
      "utf8"
    );

    expect(contextJson.taskId).toBe("T001");
    expect(contextJson.strictnessMode).toBe("standard");
    expect(contextJson.gateStatus).toBe("warnings");
    expect(contextJson.policyGate?.stage).toBe("implement");
    expect(currentPrompt).toContain("# Visp Task: T001");
    expect(currentPrompt).toContain("The user request is raw intent only");
    expect(currentPrompt).toContain("## Steps");
    expect(currentPrompt).toContain(
      "visp-kit done --task T001 --input-tokens <n> --output-tokens <n>"
    );
    expect(currentPrompt).toContain("--usage-unavailable");
    expect(currentPrompt).toContain(
      "visp-kit checklist update --task T001 --item read-context --status done"
    );
    expect(checklistJson.taskId).toBe("T001");
    expect(checklistJson.items.map((item) => item.id)).toContain("record-usage");
    expect(checklistJson.items.every((item) => item.status === "pending")).toBe(true);
    expect(checklistJson.items.every((item) => item.required)).toBe(true);
    expect(contextJson.includedRequirements.map((item) => item.id)).toEqual(["REQ001"]);
    expect(contextJson.includedFiles.map((item) => item.path)).toContain("src/notes.ts");
    expect(contextJson.artifactProvenance.map((item) => item.label)).toContain("spec");
    expect(contextJson.artifactProvenance.map((item) => item.label)).toContain("task graph");
    expect(contextJson.artifactProvenance.find((item) => item.label === "spec")).toMatchObject({
      path: ".visp/features/001-add-note-pinning/spec.json",
      hashAlgorithm: "sha256"
    });
    expect(contextJson.artifactProvenance.find((item) => item.label === "spec")?.hash).toMatch(
      /^[a-f0-9]{64}$/u
    );
    expect(contextJson.estimatedTokens.maxInput).toBe(8000);
    expect(budgetReport).toContain("# Visp Budget Report");
    expect(budgetReport).toContain("| T001 |");
  });

  it("selects the next ready task and returns JSON only", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "context", "--next", tempDir, "--json", "--force"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      taskId: string;
      budgetMode: string;
    };

    expect(summary.success).toBe(true);
    expect(summary.taskId).toBe("T001");
    expect(summary.budgetMode).toBe("lean");
  });

  it("marks over-budget contexts with max-token override", async () => {
    await createPhase8Fixture(tempDir);
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--max-tokens",
      "100",
      "--json",
      "--force"
    ]);

    const summary = JSON.parse(output.join("")) as {
      overBudget: boolean;
      estimatedTokens: { maxInput: number };
    };

    expect(summary.estimatedTokens.maxInput).toBe(100);
    expect(summary.overBudget).toBe(true);
  });

  it("honors the policy over-budget tolerance from the policy file", async () => {
    await createPhase8Fixture(tempDir);

    const runContext = async (maxTokens: number) => {
      const output: string[] = [];
      const program = createCli({ writeOut: (value) => output.push(value) });
      await program.parseAsync([
        "node",
        "visp",
        "context",
        "T001",
        tempDir,
        "--max-tokens",
        String(maxTokens),
        "--json",
        "--force"
      ]);
      return JSON.parse(output.join("")) as {
        overBudget: boolean;
        estimatedTokens: { input: number; maxInput: number };
      };
    };

    const policyPath = path.join(tempDir, ".visp", "policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8")) as {
      limits: { maxContextOverBudgetPercent: number };
    };
    const setTolerance = async (percent: number) => {
      policy.limits.maxContextOverBudgetPercent = percent;
      await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");
    };

    // Measure the untrimmed input for this fixture with a generous budget so
    // the pack is never trimmed, giving a stable reference point.
    await setTolerance(0);
    const measured = await runContext(1_000_000);
    const inputTokens = measured.estimatedTokens.input;
    expect(measured.overBudget).toBe(false);
    expect(inputTokens).toBeGreaterThan(0);

    // Choose a base budget below the measured input but within a 50% tolerance,
    // so the effective cutoff (base * 1.5) clears the input without triggering
    // trimming. Keeps the tolerance well within the schema's 0-100. A small
    // margin absorbs the 1-token render variance from echoing maxInput.
    const baseBudget = Math.floor(inputTokens / 1.4);
    expect(baseBudget).toBeLessThan(inputTokens);

    // Locked-equivalent (0%): base budget is a hard cutoff -> over budget.
    await setTolerance(0);
    const locked = await runContext(baseBudget);
    expect(locked.estimatedTokens.maxInput).toBe(baseBudget);
    expect(locked.overBudget).toBe(true);

    // 50% tolerance lifts the effective cutoff above the input -> within budget,
    // proving policy.limits.maxContextOverBudgetPercent is read and applied.
    await setTolerance(50);
    const tolerated = await runContext(baseBudget);
    expect(tolerated.estimatedTokens.maxInput).toBe(baseBudget);
    expect(tolerated.overBudget).toBe(false);
  });

  /**
   * Reachability, end to end, through the shipped binary.
   *
   * The compact snippet cap is the mechanism behind a measured -51.08% in input
   * tokens at unchanged bodied file recall — which means the pack named the
   * same files, not that it carried the same information: bodied recall equals
   * listed recall in that harness, because a file counts as bodied on a
   * non-empty summary and Kit summarises every file it lists. It was measured
   * in balanced mode on two repositories, on the shipped binary; the -52.01%
   * this comment used to quote came from a visp-dev measurement build and is
   * not producible here. Until this change there was no
   * configuration of any shipped binary in which it fired: it was reachable
   * only through an understanding case, so measuring it needed a private build.
   * This test is the standing proof that it is reachable from a command line,
   * that it can be turned off from one, and that the pack records which of the
   * two produced it.
   */
  it("applies the compact snippet cap by default and lets the command line turn it off", async () => {
    await createPhase8Fixture(tempDir);

    const runContext = async (extraArgs: readonly string[]) => {
      const program = createCli({ writeOut: () => undefined });
      await program.parseAsync([
        "node",
        "visp",
        "context",
        "T001",
        tempDir,
        "--force",
        ...extraArgs
      ]);
      const contextDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "context");
      return JSON.parse(await readFile(path.join(contextDir, "T001.context.json"), "utf8")) as {
        snippetCapApplied?: boolean;
        understanding?: unknown;
        includedSnippets: Array<{ filePath: string; startLine: number; endLine: number }>;
      };
    };

    const byDefault = await runContext([]);
    const off = await runContext(["--snippet-cap", "off"]);
    const on = await runContext(["--snippet-cap", "on"]);

    expect(byDefault.snippetCapApplied).toBe(true);
    expect(off.snippetCapApplied).toBe(false);
    expect(on.snippetCapApplied).toBe(true);

    // No understanding case anywhere near it. The cap is routed as itself, not
    // smuggled in behind an empty case.
    expect(byDefault.understanding).toBeUndefined();
    expect(on.understanding).toBeUndefined();

    expect(on.includedSnippets.length).toBeLessThanOrEqual(4);

    for (const snippet of on.includedSnippets) {
      expect(snippet.endLine - snippet.startLine + 1).toBeLessThanOrEqual(40);
    }
  });

  it("reads the snippet cap from the project config, and the flag still wins", async () => {
    await createPhase8Fixture(tempDir);

    const configPath = path.join(tempDir, ".visp", "config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<string, unknown>;
    config.contextSnippetCap = false;
    await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

    const runContext = async (extraArgs: readonly string[]) => {
      const program = createCli({ writeOut: () => undefined });
      await program.parseAsync([
        "node",
        "visp",
        "context",
        "T001",
        tempDir,
        "--force",
        ...extraArgs
      ]);
      const contextDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "context");
      return JSON.parse(await readFile(path.join(contextDir, "T001.context.json"), "utf8")) as {
        snippetCapApplied?: boolean;
      };
    };

    expect((await runContext([])).snippetCapApplied).toBe(false);
    expect((await runContext(["--snippet-cap", "on"])).snippetCapApplied).toBe(true);
  });

  /**
   * A flag the user typed beats a default they did not.
   *
   * Under the cap the selector never asks for a full file, so a capped pack
   * would ignore `--include-full-files` completely. Turning the cap off for
   * that invocation is what keeps the older flag meaning what it says, and the
   * pack carries the reason.
   */
  it("turns the cap off for an explicit full-file request, and says so", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync([
      "node",
      "visp",
      "context",
      "T001",
      tempDir,
      "--force",
      "--include-full-files"
    ]);

    const contextDir = path.join(tempDir, ".visp", "features", "001-add-note-pinning", "context");
    const pack = JSON.parse(await readFile(path.join(contextDir, "T001.context.json"), "utf8")) as {
      snippetCapApplied?: boolean;
      warnings: string[];
    };

    expect(pack.snippetCapApplied).toBe(false);
    expect(pack.warnings.join(" ")).toContain("compact snippet cap is off");
  });

  it("dry-run writes nothing", async () => {
    await createPhase8Fixture(tempDir);
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "context", "T001", tempDir, "--dry-run"]);

    expect(
      await exists(
        path.join(
          tempDir,
          ".visp",
          "features",
          "001-add-note-pinning",
          "context",
          "T001.context.md"
        )
      )
    ).toBe(false);
  });

  it("fails clearly for missing tasks and missing .visp", async () => {
    await createPhase8Fixture(tempDir);
    const errors: string[] = [];
    let program = createCli({ writeErr: (value) => errors.push(value) });

    await program.parseAsync(["node", "visp", "context", "T999", tempDir]);

    expect(process.exitCode).toBe(1);
    expect(errors.join("")).toContain("Available task IDs");

    process.exitCode = undefined;
    errors.length = 0;
    const missingDir = await mkdtemp(path.join(os.tmpdir(), "visp-context-missing-"));
    program = createCli({ writeErr: (value) => errors.push(value) });

    try {
      await program.parseAsync(["node", "visp", "context", "T001", missingDir]);
      expect(process.exitCode).toBe(1);
      expect(errors.join("")).toContain("visp-kit init");
    } finally {
      await rm(missingDir, { recursive: true, force: true });
    }
  });
});
