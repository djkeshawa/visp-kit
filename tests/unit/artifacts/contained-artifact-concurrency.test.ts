import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createArtifactReader,
  projectStatusArtifactPath,
  projectStatusSchema,
  type ArtifactReadState,
  type ProjectStatus
} from "../../../src/artifacts/public.js";
import { writeJsonFile } from "../../../src/core/file-system.js";

const CREATED_AT = "2026-08-01T00:00:00.000Z";
const REPLACEMENT_COUNT = 250;
const CONCURRENT_READER_COUNT = 8;
const EXTERNAL_SENTINEL = "VISP_EXTERNAL_STATUS_SENTINEL";

function statusAt(revision: number, featureSlug = "atomic-reader-race"): ProjectStatus {
  return {
    initialized: true,
    activeFeatureId: "001",
    activeFeatureSlug: featureSlug,
    activeFeaturePath: `.visp/features/001-${featureSlug}`,
    activeTaskId: `T${String(revision).padStart(4, "0")}`,
    currentState: "context_ready",
    lastCommand: "context",
    createdAt: CREATED_AT,
    updatedAt: new Date(Date.parse(CREATED_AT) + revision).toISOString()
  };
}

describe("contained artifact reads during atomic replacement", () => {
  let tempDir: string;
  let rootDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-contained-concurrency-"));
    rootDir = path.join(tempDir, "root");
    await mkdir(rootDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns only complete present project statuses during ordinary atomic replacements", async () => {
    const artifactPath = projectStatusArtifactPath(rootDir);
    const statuses = Array.from({ length: REPLACEMENT_COUNT + 1 }, (_, revision) =>
      statusAt(revision)
    );
    const expectedValues = new Set(statuses.map((status) => JSON.stringify(status)));
    expect(await writeJsonFile(artifactPath, statuses[0])).toEqual({
      ok: true,
      value: artifactPath
    });

    const reader = createArtifactReader(rootDir);
    const observations: ArtifactReadState<ProjectStatus>[] = [];
    let replacementsComplete = false;
    const readers = Array.from({ length: CONCURRENT_READER_COUNT }, async () => {
      while (!replacementsComplete) {
        observations.push(await reader.projectStatus());
      }
    });

    try {
      for (const status of statuses.slice(1)) {
        expect(await writeJsonFile(artifactPath, status)).toEqual({
          ok: true,
          value: artifactPath
        });
      }
    } finally {
      replacementsComplete = true;
      await Promise.all(readers);
    }

    expect(observations.length).toBeGreaterThan(0);
    expect(observations.filter((result) => result.state !== "present")).toEqual([]);
    for (const result of observations) {
      if (result.state !== "present") continue;
      expect(result.path).toBe(artifactPath);
      expect(projectStatusSchema.safeParse(result.value).success).toBe(true);
      expect(expectedValues.has(JSON.stringify(result.value))).toBe(true);
    }
  });

  it.skipIf(process.platform === "win32")(
    "keeps an external status symlink unreadable while its target is atomically replaced",
    async () => {
      const artifactPath = projectStatusArtifactPath(rootDir);
      const outsidePath = path.join(tempDir, "outside-status.json");
      await mkdir(path.dirname(artifactPath), { recursive: true });
      expect(await writeJsonFile(outsidePath, statusAt(0, EXTERNAL_SENTINEL))).toEqual({
        ok: true,
        value: outsidePath
      });
      await symlink(outsidePath, artifactPath);

      const reader = createArtifactReader(rootDir);
      for (let revision = 1; revision <= 20; revision += 1) {
        const [readResult, writeResult] = await Promise.all([
          reader.projectStatus(),
          writeJsonFile(outsidePath, statusAt(revision, EXTERNAL_SENTINEL))
        ]);

        expect(writeResult).toEqual({ ok: true, value: outsidePath });
        expect(readResult).toMatchObject({
          state: "unreadable",
          path: artifactPath,
          issue: "io"
        });
        expect(readResult).not.toHaveProperty("value");
        expect(JSON.stringify(readResult)).not.toContain(EXTERNAL_SENTINEL);
      }
    }
  );
});
