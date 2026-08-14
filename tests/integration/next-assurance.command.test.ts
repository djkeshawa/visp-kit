import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runCommand } from "../../src/core/command-runner.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

type NextSummary = {
  readonly nextCommand: string;
  readonly reason: string;
  readonly assurancePhase?: string;
  readonly implementationAllowed?: boolean;
};

async function runGit(targetPath: string, args: readonly string[]): Promise<void> {
  expectOk(await runCommand("git", args, { cwd: targetPath }));
}

/**
 * Each CLI invocation gets its own program: commander stores parsed option
 * values on the command instance, so a reused program leaks flags between runs.
 */
async function cli(args: readonly string[]): Promise<string> {
  const output: string[] = [];
  const program = createCli({
    writeOut: (value) => output.push(value),
    writeErr: (value) => output.push(value)
  });
  await program.parseAsync(["node", "visp", ...args]);
  process.exitCode = undefined;
  return output.join("");
}

async function next(targetPath: string): Promise<NextSummary> {
  return JSON.parse(await cli(["next", targetPath, "--json"])) as NextSummary;
}

describe("visp-kit next drives the assurance sequence", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-next-assurance-"));
    process.exitCode = undefined;
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await removeTempDirWithRetry(tempDir);
  });

  async function prepareLockedProject(): Promise<void> {
    await createPhase8Fixture(tempDir);
    await runGit(tempDir, ["init"]);
    // Dependency installs are not the agent's work; without this the fixture's
    // node_modules reads as implementation and skews phase detection.
    await writeFile(path.join(tempDir, ".git", "info", "exclude"), "node_modules/\n", "utf8");
    await runGit(tempDir, ["add", "."]);
    await runGit(tempDir, [
      "-c",
      "user.name=Visp Test",
      "-c",
      "user.email=visp@example.invalid",
      "commit",
      "-m",
      "fixture"
    ]);
    await cli(["policy", "init", tempDir, "--strictness", "locked", "--force", "--json"]);
    await cli(["context", "T001", tempDir, "--force"]);
  }

  it("walks a locked project from context to an authorized implementation", async () => {
    await prepareLockedProject();

    // 1. The oracle plan. Before this change `next` recommended the
    //    implementation prompt here and never named the oracle at all.
    const plan = await next(tempDir);
    expect(plan.assurancePhase).toBe("plan");
    expect(plan.nextCommand).toBe("visp-kit oracle plan --task T001");
    expect(plan.implementationAllowed).toBe(false);
    await cli(["oracle", "plan", tempDir, "--task", "T001", "--json"]);

    // 2. Freezing the plan.
    const lock = await next(tempDir);
    expect(lock.assurancePhase).toBe("lock");
    expect(lock.nextCommand).toBe("visp-kit oracle lock --task T001");
    await cli(["oracle", "lock", tempDir, "--task", "T001", "--json"]);

    // 3. Baseline evidence: run the locked commands BEFORE any code is written,
    //    so there is something for the candidate run to be compared against.
    const baseline = await next(tempDir);
    expect(baseline.assurancePhase).toBe("baseline");
    expect(baseline.nextCommand).toBe("visp-kit verify --baseline --task T001");
    await cli(["verify", tempDir, "--baseline", "--task", "T001", "--json"]);

    // 4. Only now is implementation authorized, and the oracle artifacts the
    //    previous three steps wrote must not read as implementation.
    const authorized = await next(tempDir);
    expect(authorized.assurancePhase).toBe("authorized");
    expect(authorized.nextCommand).toContain(".visp/prompts/current-task.prompt.md");
    expect(authorized.implementationAllowed).toBe(true);
  }, 180000);

  it("requires candidate evidence before ordinary verification", async () => {
    await prepareLockedProject();
    await cli(["oracle", "plan", tempDir, "--task", "T001", "--json"]);
    await cli(["oracle", "lock", tempDir, "--task", "T001", "--json"]);
    await cli(["verify", tempDir, "--baseline", "--task", "T001", "--json"]);

    const notesPath = path.join(tempDir, "src", "notes.ts");
    await writeFile(
      notesPath,
      `${await readFile(notesPath, "utf8")}\nexport const pinnedMarker = "pinned";\n`,
      "utf8"
    );

    const candidate = await next(tempDir);
    expect(candidate.assurancePhase).toBe("candidate");
    expect(candidate.nextCommand).toBe("visp-kit verify --candidate --task T001");
    // Without the assurance step this would have been plain `visp-kit verify`,
    // which never compares the result against the locked baseline.
    expect(candidate.reason).toContain("candidate evidence");
  }, 180000);

  it("says nothing about assurance when no preset or plan activates it", async () => {
    await createPhase8Fixture(tempDir);
    await runGit(tempDir, ["init"]);
    await writeFile(path.join(tempDir, ".git", "info", "exclude"), "node_modules/\n", "utf8");
    await runGit(tempDir, ["add", "."]);
    await runGit(tempDir, [
      "-c",
      "user.name=Visp Test",
      "-c",
      "user.email=visp@example.invalid",
      "commit",
      "-m",
      "fixture"
    ]);
    await cli(["policy", "init", tempDir, "--strictness", "standard", "--force", "--json"]);
    await cli(["context", "T001", tempDir, "--force"]);

    const summary = await next(tempDir);

    expect(summary.assurancePhase).toBe("inactive");
    expect(summary.nextCommand).not.toContain("oracle");
    expect(summary.nextCommand).not.toContain("--baseline");
  }, 180000);
});
