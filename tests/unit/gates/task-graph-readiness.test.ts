// A2 — the readiness branch D-132 missed.
//
// D-132 made clarify, spec and plan advance on READINESS rather than existence,
// so `next` answers `visp-kit <stage> --validate` for an artifact that is on
// disk but not yet usable. `tasks` was left on an existence check:
//
//     if (!state.artifactSummary.taskGraph) return "visp-kit tasks";
//
// That looks harmless and is not. The coordinator advances by replaying the
// string `next` hands it, so a half-filled task graph produced no runnable
// answer at all — the user was forced back to `visp-kit tasks --validate`,
// which is not one of the thirteen verbs. It was one of eight such forced
// drops between an empty project and implementation-allowed.
//
// Paired assertions throughout: an over-correction that reported every task
// graph as incomplete would satisfy the first half of each pair alone.

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { taskGraphReadiness } from "../../../src/gates/artifact-readiness.js";
import { evaluateGate } from "../../../src/gates/gate-engine.js";
import { loadProjectState } from "../../../src/orchestrator/project-state.js";
import { createPhase8Fixture, expectOk } from "../../integration/phase8-fixture.js";

const NOW = "2026-01-01T00:00:00.000Z";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-taskgraph-readiness-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

async function state() {
  return expectOk(await loadProjectState({ targetPath: tempDir }));
}

const graphPath = (): string =>
  path.join(tempDir, ".visp", "features", "001-add-note-pinning", "task-graph.json");

async function editGraph(update: (value: any) => void): Promise<void> {
  const value = JSON.parse(await readFile(graphPath(), "utf8"));
  update(value);
  await writeFile(graphPath(), `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

describe("taskGraphReadiness", () => {
  it("reports a complete task graph as ready", async () => {
    // The converse guard. Without it, "always incomplete" passes every test
    // below and blocks a workflow the product accepts.
    await createPhase8Fixture(tempDir);

    expect(taskGraphReadiness(await state())).toEqual({ state: "ready" });
  });

  it("reports an absent task graph as missing, not incomplete", async () => {
    await createPhase8Fixture(tempDir);
    await rm(graphPath(), { force: true });

    expect(taskGraphReadiness(await state()).state).toBe("missing");
  });

  it("reports a present-but-invalid task graph as incomplete, with reasons", async () => {
    await createPhase8Fixture(tempDir);
    // Point a task at a requirement the spec does not define — exactly what
    // `visp-kit tasks --validate` refuses.
    await editGraph((graph) => {
      graph.tasks[0].requirementIds = ["REQ404"];
    });

    const readiness = taskGraphReadiness(await state());

    expect(readiness.state).toBe("incomplete");
    if (readiness.state === "incomplete") {
      expect(readiness.errors.length).toBeGreaterThan(0);
      expect(readiness.errors.join(" ")).toContain("REQ404");
    }
  });
});

describe("next advances tasks on readiness, not existence", () => {
  async function nextCommand(): Promise<string | undefined> {
    const result = expectOk(
      await evaluateGate({ targetPath: tempDir, stage: "next", dryRun: true, now: NOW })
    );
    return result.nextCommand;
  }

  it("sends a half-filled task graph to `visp-kit tasks --validate`", async () => {
    await createPhase8Fixture(tempDir);
    await editGraph((graph) => {
      graph.tasks[0].requirementIds = ["REQ404"];
    });

    expect(
      await nextCommand(),
      "A task graph that exists but cannot pass validation must send the reader to " +
        "--validate. Answering `visp-kit tasks` would tell them to regenerate work they " +
        "already did, and answering nothing leaves the coordinator unable to resume."
    ).toBe("visp-kit tasks --validate");
  });

  it("does not send a complete task graph back to validate", async () => {
    await createPhase8Fixture(tempDir);

    expect(await nextCommand()).not.toBe("visp-kit tasks --validate");
  });

  it("still sends an absent task graph to `visp-kit tasks`", async () => {
    await createPhase8Fixture(tempDir);
    await rm(graphPath(), { force: true });

    expect(await nextCommand()).toBe("visp-kit tasks");
  });
});
