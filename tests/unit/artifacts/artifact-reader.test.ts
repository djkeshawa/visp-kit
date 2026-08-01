import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  readArtifact,
  readArtifactState,
  readContainedArtifactState
} from "../../../src/artifacts/artifact-reader.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";
import { runCommand } from "../../../src/core/command-runner.js";
import { isErr, isOk } from "../../../src/core/result.js";
import { validProjectProfile } from "./fixtures.js";

async function readFifoWithRescue<T>(
  fifoPath: string,
  rescue: { triggered: boolean },
  read: () => Promise<T>
): Promise<T> {
  let rescueWrite: Promise<void> | undefined;
  const rescueTimer = setTimeout(() => {
    rescue.triggered = true;
    rescueWrite = writeFile(fifoPath, JSON.stringify(validProjectProfile), "utf8");
  }, 250);
  try {
    return await read();
  } finally {
    clearTimeout(rescueTimer);
    await rescueWrite;
  }
}

describe("artifact reader", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-artifact-reader-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads and validates artifact JSON before returning data", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, JSON.stringify(validProjectProfile), "utf8");

    const result = await readArtifact(artifactPath, projectProfileSchema, {
      artifactName: "project profile"
    });

    expect(result).toEqual({ ok: true, value: validProjectProfile });
  });

  it("returns explicit present metadata for a validated artifact", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, JSON.stringify(validProjectProfile), "utf8");

    const result = await readArtifactState(artifactPath, projectProfileSchema);

    expect(result.state).toBe("present");
    if (result.state === "present") {
      expect(result.path).toBe(artifactPath);
      expect(result.value).toEqual(validProjectProfile);
      expect(result.modifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/u);
    }
  });

  it("distinguishes missing artifacts", async () => {
    const artifactPath = path.join(tempDir, "missing.json");

    expect(await readArtifactState(artifactPath, projectProfileSchema)).toEqual({
      state: "missing",
      path: artifactPath,
      reason: `Artifact is missing at ${artifactPath}.`
    });
  });

  it("marks a valid artifact stale against an explicit freshness boundary", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, JSON.stringify(validProjectProfile), "utf8");
    await utimes(
      artifactPath,
      new Date("2026-01-01T00:00:00.000Z"),
      new Date("2026-01-01T00:00:00.000Z")
    );

    const result = await readArtifactState(artifactPath, projectProfileSchema, {
      staleAfter: new Date("2026-01-02T00:00:00.000Z")
    });

    expect(result.state).toBe("stale");
    if (result.state === "stale") {
      expect(result.value).toEqual(validProjectProfile);
      expect(result.reason).toContain("older than the required freshness boundary");
    }
  });

  it("rejects an invalid caller-supplied freshness boundary", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, JSON.stringify(validProjectProfile), "utf8");

    await expect(
      readArtifactState(artifactPath, projectProfileSchema, { staleAfter: new Date(Number.NaN) })
    ).rejects.toThrow("staleAfter must be a valid Date");
  });

  it.each([
    ["invalid JSON", "{", "invalid_json"],
    [
      "schema-invalid JSON",
      JSON.stringify({ ...validProjectProfile, packageManager: "pnpmx" }),
      "invalid_schema"
    ]
  ] as const)("marks %s unreadable", async (_label, contents, issue) => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, contents, "utf8");

    const result = await readArtifactState(artifactPath, projectProfileSchema);

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.issue).toBe(issue);
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("marks malformed UTF-8 inside otherwise schema-valid JSON unreadable as invalid JSON", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    const contents = Buffer.from(JSON.stringify({ ...validProjectProfile, name: "x" }), "utf8");
    const nameValueOffset =
      contents.indexOf(Buffer.from('"name":"x"', "utf8")) + Buffer.byteLength('"name":"');
    contents[nameValueOffset] = 0x80;
    await writeFile(artifactPath, contents);

    const result = await readArtifactState(artifactPath, projectProfileSchema);

    expect(result.state).toBe("unreadable");
    if (result.state === "unreadable") {
      expect(result.path).toBe(artifactPath);
      expect(result.issue).toBe("invalid_json");
      expect(result.reason.length).toBeGreaterThan(0);
    }
  });

  it("returns a clear validation error for invalid JSON", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    await writeFile(artifactPath, "{", "utf8");

    const result = await readArtifact(artifactPath, projectProfileSchema);

    expect(isErr(result)).toBe(true);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("Invalid JSON");
      expect(result.error.details).toEqual({ artifactPath });
      expect(result.error.cause).toBeInstanceOf(SyntaxError);
    }
  });

  it("preserves the legacy missing-file error contract", async () => {
    const artifactPath = path.join(tempDir, "missing.json");

    const result = await readArtifact(artifactPath, projectProfileSchema);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("FILE_NOT_FOUND");
      expect(result.error.message).toBe(`Unable to read ${artifactPath}.`);
      expect(result.error.details).toEqual({ path: artifactPath });
      expect((result.error.cause as NodeJS.ErrnoException).code).toBe("ENOENT");
    }
  });

  it("preserves the legacy non-ENOENT I/O error contract", async () => {
    const artifactPath = path.join(tempDir, "directory.json");
    await mkdir(artifactPath);

    const result = await readArtifact(artifactPath, projectProfileSchema);

    expect(isErr(result)).toBe(true);
    if (isErr(result)) {
      expect(result.error.code).toBe("FILE_SYSTEM_ERROR");
      expect(result.error.message).toBe(`Unable to read ${artifactPath}.`);
      expect(result.error.details).toEqual({ path: artifactPath });
      expect(result.error.cause).toBeInstanceOf(Error);
    }
  });

  it.skipIf(process.platform === "win32")(
    "rejects generic and contained FIFOs without waiting for a writer",
    async () => {
      const genericPath = path.join(tempDir, "generic.json");
      const containedPath = path.join(tempDir, "contained.json");
      for (const fifoPath of [genericPath, containedPath]) {
        const created = await runCommand("mkfifo", [fifoPath]);
        expect(created.ok).toBe(true);
        if (created.ok) expect(created.value.exitCode).toBe(0);
      }

      const genericRescue = { triggered: false };
      expect(
        await readFifoWithRescue(genericPath, genericRescue, () =>
          readArtifactState(genericPath, projectProfileSchema)
        )
      ).toMatchObject({ state: "unreadable", issue: "io" });
      expect(genericRescue.triggered).toBe(false);

      const containedRescue = { triggered: false };
      expect(
        await readFifoWithRescue(containedPath, containedRescue, () =>
          readContainedArtifactState(tempDir, containedPath, projectProfileSchema)
        )
      ).toMatchObject({ state: "unreadable", issue: "io" });
      expect(containedRescue.triggered).toBe(false);
      expect(await readArtifactState("/dev/null", projectProfileSchema)).toMatchObject({
        state: "unreadable",
        issue: "io"
      });
    }
  );

  it("returns field-level validation errors for invalid artifacts", async () => {
    const artifactPath = path.join(tempDir, "project.json");
    const invalid = { ...validProjectProfile, packageManager: "pnpmx" };
    await writeFile(artifactPath, JSON.stringify(invalid), "utf8");

    const result = await readArtifact(artifactPath, projectProfileSchema, {
      artifactName: "project profile"
    });

    expect(isOk(result)).toBe(false);

    if (isErr(result)) {
      expect(result.error.code).toBe("VALIDATION_FAILED");
      expect(result.error.message).toContain("Invalid project profile");
      expect(result.error.message).toContain("packageManager");
      expect(result.error.details).toMatchObject({
        artifactName: "project profile",
        artifactPath,
        issues: expect.arrayContaining([
          expect.objectContaining({ path: "packageManager", code: "invalid_enum_value" })
        ])
      });
      expect(result.error.cause).toMatchObject({ name: "ZodError" });
    }
  });
});
