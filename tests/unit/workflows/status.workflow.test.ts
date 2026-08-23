import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { compactConstitutionArtifactPath } from "../../../src/artifacts/artifact-paths.js";
import { type CommandRunner } from "../../../src/core/command-runner.js";
import { ok } from "../../../src/core/result.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { formatStatusSummary, runStatusWorkflow } from "../../../src/workflows/status.workflow.js";

function runner(): CommandRunner {
  return {
    async run(command, args, options) {
      return ok({
        command,
        args: args ?? [],
        cwd: options?.cwd,
        exitCode: 0,
        signal: null,
        stdout: (args ?? []).join(" ") === "rev-parse --is-inside-work-tree" ? "false\n" : "",
        stderr: "",
        timedOut: false
      });
    }
  };
}

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected ok.");
  return result.value;
}

describe("runStatusWorkflow", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-status-workflow-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("writes status reports when requested", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runStatusWorkflow({
        targetPath: tempDir,
        writeReport: true,
        commandRunner: runner()
      })
    );

    expect(summary.initialized).toBe(true);
    expect(summary.reportPath).toBe(".visp/reports/status-report.md");
    expect(
      await readFile(path.join(tempDir, ".visp", "reports", "status-report.md"), "utf8")
    ).toContain("Visp Status");
  });

  it("fails clearly when the project is not initialized", async () => {
    const result = await runStatusWorkflow({
      targetPath: tempDir,
      commandRunner: runner()
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected status to fail.");
    expect(result.error.message).toContain("visp-kit init");
  });

  // `init` writes the config but no profile — the profile is what `scan`
  // produces. Every field status reads from the profile has to say so rather
  // than borrow a value from somewhere else or read as empty.
  it("reports what a scan has not yet answered as unknown", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runStatusWorkflow({ targetPath: tempDir, commandRunner: runner() })
    );
    const rendered = formatStatusSummary(summary);

    expect(summary.scanned).toBe(false);
    expect(summary.project.packageManager).toBe("unknown");
    expect(summary.project.languages).toEqual([]);
    expect(summary.project.frameworks).toEqual([]);
    expect(summary.activeFeature).toBeNull();
    expect(rendered).toContain("Scanned: no");
    expect(rendered).toContain("Package manager: unknown");
  });

  // Status reads the disk, not the init record. What it reads is narrower than
  // the name suggests: presence is decided by the COMPACT rendering alone
  // (`project-state.ts`), so removing that one derived file is enough to make
  // status say "no" while `constitution.json` and `constitution.md` are still
  // there. Pinned as the current answer, not endorsed as the right one.
  it("reports a deleted compact constitution as absent", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    await rm(compactConstitutionArtifactPath(tempDir), { force: true });

    const summary = expectOk(
      await runStatusWorkflow({ targetPath: tempDir, commandRunner: runner() })
    );

    expect(summary.constitution).toBe(false);
    expect(formatStatusSummary(summary)).toContain("Constitution: no");
  });

  it("reports every kind of evidence as missing before any of it exists", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runStatusWorkflow({ targetPath: tempDir, commandRunner: runner() })
    );

    expect(summary.latestEvidence).toMatchObject({
      context: "missing",
      verification: "missing",
      review: "missing",
      reconcile: "missing",
      pr: "missing"
    });
    expect(summary.latestGate).toBe("missing");
    expect(summary.evaluation).toBe("missing");
    expect(summary.activeOverrideCount).toBe(0);
  });

  // The verbose block is the only place the per-artifact answers are printed;
  // the default rendering must not carry them, or `--verbose` means nothing.
  it("prints the per-artifact detail only when asked to be verbose", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));

    const summary = expectOk(
      await runStatusWorkflow({ targetPath: tempDir, commandRunner: runner() })
    );

    expect(formatStatusSummary(summary)).not.toContain("Artifacts:");

    const verbose = formatStatusSummary(summary, { verbose: true });

    expect(verbose).toContain("Artifacts:");
    expect(verbose).toContain("Spec: no");
    expect(verbose).toContain("Languages: unknown");
    expect(verbose).toContain("Frameworks: none");
  });
});
