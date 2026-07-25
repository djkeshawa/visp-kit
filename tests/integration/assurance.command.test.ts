import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { createCli } from "../../src/cli/main.js";
import {
  defaultCommandRunner,
  runCommand,
  type CommandRunner
} from "../../src/core/command-runner.js";
import { ok } from "../../src/core/result.js";
import { runAssuranceWorkflow } from "../../src/workflows/assurance.workflow.js";
import { createPhase8Fixture, expectOk } from "./phase8-fixture.js";

async function prepareAssuranceFixture(targetPath: string): Promise<void> {
  await createPhase8Fixture(targetPath);
  expectOk(await runCommand("git", ["init"], { cwd: targetPath }));
  expectOk(await runCommand("git", ["add", "."], { cwd: targetPath }));
  expectOk(
    await runCommand(
      "git",
      [
        "-c",
        "user.name=Visp Test",
        "-c",
        "user.email=visp@example.invalid",
        "commit",
        "-m",
        "fixture"
      ],
      { cwd: targetPath }
    )
  );
  const program = createCli({ writeOut: () => undefined });
  await program.parseAsync(["node", "visp", "context", "T001", targetPath, "--force"]);
  await program.parseAsync(["node", "visp", "oracle", "plan", targetPath, "--task", "T001"]);
  await program.parseAsync(["node", "visp", "oracle", "lock", targetPath, "--task", "T001"]);
  await writeFile(
    path.join(targetPath, "src", "notes.ts"),
    `${await readFile(path.join(targetPath, "src", "notes.ts"), "utf8")}\nexport const assured = true;\n`,
    "utf8"
  );
  process.exitCode = undefined;
}

describe("assurance command", () => {
  const roots: string[] = [];

  afterEach(() => {
    process.exitCode = undefined;
    return Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("routes generate options to the assurance workflow and prints JSON", async () => {
    const writeOut = vi.fn();
    const runAssurance = vi.fn(async () =>
      ok({
        success: true as const,
        taskId: "T001",
        mode: "base_to_commit" as const,
        verdict: "passed" as const,
        caseHash: `sha256:${"a".repeat(64)}`,
        snapshotHash: `sha256:${"b".repeat(64)}`,
        actions: [],
        dryRun: true,
        nextCommand: "visp review --task T001"
      })
    );
    const program = createCli({
      cwd: "/workspace",
      runAssurance,
      writeOut,
      writeErr: vi.fn()
    });
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      "project",
      "--task",
      "T001",
      "--feature",
      "001-example",
      "--target",
      "HEAD",
      "--dry-run",
      "--json"
    ]);
    expect(runAssurance).toHaveBeenCalledWith({
      targetPath: "project",
      cwd: "/workspace",
      feature: "001-example",
      taskId: "T001",
      targetRevision: "HEAD",
      dryRun: true
    });
    expect(JSON.parse(writeOut.mock.calls[0]![0])).toMatchObject({
      taskId: "T001",
      mode: "base_to_commit",
      verdict: "passed"
    });
  });

  it("generates honest missing-evidence artifacts from the phase 8 fixture", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-command-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    const output: string[] = [];
    const errors: string[] = [];
    const program = createCli({
      writeOut: (value) => output.push(value),
      writeErr: (value) => errors.push(value)
    });
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      targetPath,
      "--task",
      "T001",
      "--json"
    ]);
    expect(errors).toEqual([]);
    expect(JSON.parse(output.join(""))).toMatchObject({
      taskId: "T001",
      mode: "base_to_workspace",
      verdict: "inconclusive"
    });
    expect(process.exitCode).toBeUndefined();
    const assuranceDir = path.join(
      targetPath,
      ".visp",
      "features",
      "001-add-note-pinning",
      "assurance",
      "T001"
    );
    const assuranceCase = JSON.parse(
      await readFile(path.join(assuranceDir, "assurance-case.json"), "utf8")
    ) as {
      bindings: Array<{ role: string; status: string; reason?: string }>;
      evidenceComparisons: Array<{
        baseline: { uncertainty: { reasons: string[] } };
        candidate: { uncertainty: { reasons: string[] } };
      }>;
    };
    expect(assuranceCase.bindings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "baseline_evidence", status: "unavailable" }),
        expect.objectContaining({ role: "candidate_evidence", status: "unavailable" })
      ])
    );
    expect(assuranceCase.evidenceComparisons[0]?.baseline.uncertainty.reasons).toContain(
      "Baseline evidence artifact is missing."
    );
    expect(assuranceCase.evidenceComparisons[0]?.candidate.uncertainty.reasons).toContain(
      "Candidate evidence artifact is missing."
    );
    expect(await readFile(path.join(assuranceDir, "diff-snapshot.json"), "utf8")).toContain(
      '"snapshotSha256"'
    );
    expect(await readFile(path.join(assuranceDir, "assurance-case.md"), "utf8")).toContain(
      "## Bindings and code states"
    );
    const firstBytes = await Promise.all(
      ["assurance-case.json", "diff-snapshot.json", "assurance-case.md"].map((fileName) =>
        readFile(path.join(assuranceDir, fileName), "utf8")
      )
    );
    const firstSummary = JSON.parse(output.join("")) as {
      caseHash: string;
      snapshotHash: string;
    };
    output.length = 0;
    await program.parseAsync([
      "node",
      "visp",
      "assurance",
      "generate",
      targetPath,
      "--task",
      "T001",
      "--json"
    ]);
    const secondBytes = await Promise.all(
      ["assurance-case.json", "diff-snapshot.json", "assurance-case.md"].map((fileName) =>
        readFile(path.join(assuranceDir, fileName), "utf8")
      )
    );
    const secondSummary = JSON.parse(output.join("")) as {
      caseHash: string;
      snapshotHash: string;
    };
    expect(secondBytes).toEqual(firstBytes);
    expect(secondSummary.caseHash).toBe(firstSummary.caseHash);
    expect(secondSummary.snapshotHash).toBe(firstSummary.snapshotHash);
  }, 30_000);

  it("fails closed when authoritative inputs change after the initial build", async () => {
    const targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-assurance-drift-"));
    roots.push(targetPath);
    await prepareAssuranceFixture(targetPath);
    let writeTreeCalls = 0;
    let mutated = false;
    const commandRunner: CommandRunner = {
      run: async (command, args = [], options = {}) => {
        const result = await defaultCommandRunner.run(command, args, options);
        if (args.includes("write-tree")) writeTreeCalls += 1;
        if (
          !mutated &&
          writeTreeCalls >= 2 &&
          command === "git" &&
          args[0] === "rev-parse" &&
          args[1] === "--is-inside-work-tree"
        ) {
          mutated = true;
          await writeFile(
            path.join(targetPath, ".visp", "overrides.json"),
            `${JSON.stringify(
              {
                version: "1.0",
                overrides: [
                  {
                    id: "OVR999",
                    ruleId: "VSP999",
                    scope: "project",
                    reason: "Regression fixture input drift.",
                    status: "active",
                    createdAt: "2026-07-25T00:00:00.000Z",
                    createdBy: "test"
                  }
                ]
              },
              null,
              2
            )}\n`,
            "utf8"
          );
        }
        return result;
      }
    };

    const result = await runAssuranceWorkflow({
      targetPath,
      taskId: "T001",
      commandRunner,
      now: "2026-07-25T01:00:00.000Z"
    });

    expect(mutated).toBe(true);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain(
      "Authoritative assurance inputs or workflow action changed"
    );
  }, 30_000);
});
