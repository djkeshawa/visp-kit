import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type Task } from "../../../src/artifacts/schemas/task.schema.js";
import { pathExists } from "../../../src/core/file-system.js";
import {
  clearTaskImplementMarker,
  implementMarkerDirPath,
  implementMarkerPath,
  listActiveImplementMarkers,
  taskImplementMarkerPath,
  writeImplementMarker
} from "../../../src/gates/implement-marker.js";

function task(id: string, allowedFiles: readonly string[]): Task {
  return {
    id,
    title: `Task ${id}`,
    description: `Work for ${id}.`,
    requirementIds: [],
    acceptanceCriterionIds: [],
    dependsOn: [],
    allowedFiles: [...allowedFiles],
    expectedFiles: [],
    forbiddenFiles: [],
    validationCommands: [],
    status: "in_progress",
    parallelizable: true,
    riskLevel: "low"
  };
}

async function exists(filePath: string): Promise<boolean> {
  const result = await pathExists(filePath);
  return result.ok && result.value;
}

describe("implement markers", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-implement-marker-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeMarkerFor(id: string, allowedFiles: readonly string[]): Promise<void> {
    const written = await writeImplementMarker({
      targetPath: tempDir,
      task: task(id, allowedFiles),
      featureId: "001",
      strictnessMode: "strict",
      now: "2026-07-03T00:00:00.000Z"
    });

    expect(written.ok).toBe(true);
  }

  it("writes both the per-task marker and the legacy marker", async () => {
    await writeMarkerFor("T001", ["src/a.ts"]);

    expect(await exists(taskImplementMarkerPath(tempDir, "T001"))).toBe(true);
    expect(await exists(implementMarkerPath(tempDir))).toBe(true);

    const legacy = JSON.parse(await readFile(implementMarkerPath(tempDir), "utf8")) as {
      taskId: string;
    };

    expect(legacy.taskId).toBe("T001");
  });

  it("lists concurrent authorizations for multiple tasks", async () => {
    await writeMarkerFor("T001", ["src/a.ts"]);
    await writeMarkerFor("T002", ["src/b.ts"]);

    const markers = await listActiveImplementMarkers(tempDir);

    expect(markers.map((marker) => marker.taskId)).toEqual(["T001", "T002"]);
  });

  it("skips unreadable per-task markers without failing", async () => {
    await writeMarkerFor("T001", ["src/a.ts"]);
    await writeFile(path.join(implementMarkerDirPath(tempDir), "T999.json"), "{ nope", "utf8");

    const markers = await listActiveImplementMarkers(tempDir);

    expect(markers.map((marker) => marker.taskId)).toEqual(["T001"]);
  });

  it("honors a legacy-only marker", async () => {
    await mkdir(path.dirname(implementMarkerPath(tempDir)), { recursive: true });
    await writeFile(
      implementMarkerPath(tempDir),
      JSON.stringify({
        version: "1.0",
        taskId: "T007",
        featureId: "001",
        strictnessMode: "strict",
        allowedFiles: ["src/legacy.ts"],
        expectedFiles: [],
        forbiddenFiles: [],
        createdAt: "2026-07-03T00:00:00.000Z"
      }),
      "utf8"
    );

    const markers = await listActiveImplementMarkers(tempDir);

    expect(markers.map((marker) => marker.taskId)).toEqual(["T007"]);
  });

  it("clears only the named task and keeps other authorizations", async () => {
    await writeMarkerFor("T001", ["src/a.ts"]);
    await writeMarkerFor("T002", ["src/b.ts"]);

    const cleared = await clearTaskImplementMarker(tempDir, "T001");

    expect(cleared.ok).toBe(true);
    expect(await exists(taskImplementMarkerPath(tempDir, "T001"))).toBe(false);
    expect(await exists(taskImplementMarkerPath(tempDir, "T002"))).toBe(true);

    const markers = await listActiveImplementMarkers(tempDir);

    expect(markers.map((marker) => marker.taskId)).toEqual(["T002"]);
  });

  it("clears the legacy marker only when it belongs to the cleared task", async () => {
    await writeMarkerFor("T001", ["src/a.ts"]);
    await writeMarkerFor("T002", ["src/b.ts"]);

    // Legacy now points at T002 (most recent write). Clearing T001 keeps it.
    const clearedOther = await clearTaskImplementMarker(tempDir, "T001");

    expect(clearedOther.ok).toBe(true);
    expect(await exists(implementMarkerPath(tempDir))).toBe(true);

    const clearedOwn = await clearTaskImplementMarker(tempDir, "T002");

    expect(clearedOwn.ok).toBe(true);
    expect(await exists(implementMarkerPath(tempDir))).toBe(false);
  });
});
