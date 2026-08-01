import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createArtifactReader, type ArtifactReadState } from "../../../src/artifacts/public.js";
import { validConstitution } from "./fixtures.js";

const EXTERNAL_SENTINEL = "VISP_EXTERNAL_ARTIFACT_SENTINEL";

function expectContainedReadFailure(
  result: ArtifactReadState<unknown>,
  expectedPath: string,
  sentinel: string
): void {
  expect(result).toMatchObject({
    state: "unreadable",
    path: expectedPath,
    issue: "io"
  });
  expect(result).not.toHaveProperty("value");
  expect(JSON.stringify(result)).not.toContain(sentinel);
}

describe("contained artifact accessors", () => {
  let tempDir: string;
  let rootDir: string;
  let outsideDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-contained-artifacts-"));
    rootDir = path.join(tempDir, "root");
    outsideDir = path.join(tempDir, "outside");
    await Promise.all([
      mkdir(rootDir, { recursive: true }),
      mkdir(outsideDir, { recursive: true })
    ]);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reads ordinary JSON and text artifacts stored inside the reader root", async () => {
    const memoryDir = path.join(rootDir, ".visp", "memory");
    const constitutionPath = path.join(memoryDir, "constitution.json");
    const summaryPath = path.join(memoryDir, "project-summary.md");
    const summary = "# In-root project summary\n";
    await mkdir(memoryDir, { recursive: true });
    await Promise.all([
      writeFile(constitutionPath, JSON.stringify(validConstitution), "utf8"),
      writeFile(summaryPath, summary, "utf8")
    ]);

    const reader = createArtifactReader(rootDir);

    expect(await reader.constitutionArtifact()).toMatchObject({
      state: "present",
      path: constitutionPath,
      value: validConstitution
    });
    expect(await reader.projectSummary()).toMatchObject({
      state: "present",
      path: summaryPath,
      value: summary
    });
  });

  it.skipIf(process.platform === "win32")(
    "rejects final JSON and text symlinks whose targets are outside the reader root",
    async () => {
      const memoryDir = path.join(rootDir, ".visp", "memory");
      const constitutionPath = path.join(memoryDir, "constitution.json");
      const summaryPath = path.join(memoryDir, "project-summary.md");
      const outsideConstitutionPath = path.join(outsideDir, "constitution.json");
      const outsideSummaryPath = path.join(outsideDir, "project-summary.md");
      await mkdir(memoryDir, { recursive: true });
      await Promise.all([
        writeFile(
          outsideConstitutionPath,
          JSON.stringify({
            ...validConstitution,
            title: `${validConstitution.title} ${EXTERNAL_SENTINEL}`
          }),
          "utf8"
        ),
        writeFile(outsideSummaryPath, `# ${EXTERNAL_SENTINEL}\n`, "utf8")
      ]);
      await Promise.all([
        symlink(outsideConstitutionPath, constitutionPath),
        symlink(outsideSummaryPath, summaryPath)
      ]);

      const reader = createArtifactReader(rootDir);

      expectContainedReadFailure(
        await reader.constitutionArtifact(),
        constitutionPath,
        EXTERNAL_SENTINEL
      );
      expectContainedReadFailure(await reader.projectSummary(), summaryPath, EXTERNAL_SENTINEL);
    }
  );

  it.skipIf(process.platform === "win32")(
    "classifies dangling final JSON and text symlinks as unreadable rather than missing",
    async () => {
      const memoryDir = path.join(rootDir, ".visp", "memory");
      const constitutionPath = path.join(memoryDir, "constitution.json");
      const summaryPath = path.join(memoryDir, "project-summary.md");
      await mkdir(memoryDir, { recursive: true });
      await Promise.all([
        symlink("missing-constitution.json", constitutionPath),
        symlink("missing-project-summary.md", summaryPath)
      ]);

      const reader = createArtifactReader(rootDir);

      expectContainedReadFailure(
        await reader.constitutionArtifact(),
        constitutionPath,
        "DANGLING_TARGET_SENTINEL"
      );
      expectContainedReadFailure(
        await reader.projectSummary(),
        summaryPath,
        "DANGLING_TARGET_SENTINEL"
      );
    }
  );

  it.skipIf(process.platform === "win32")(
    "rejects JSON and text artifacts reached through an intermediate .visp subdirectory symlink",
    async () => {
      const outsideMemoryDir = path.join(outsideDir, "memory");
      const memoryLinkPath = path.join(rootDir, ".visp", "memory");
      const constitutionPath = path.join(memoryLinkPath, "constitution.json");
      const summaryPath = path.join(memoryLinkPath, "project-summary.md");
      await Promise.all([
        mkdir(path.dirname(memoryLinkPath), { recursive: true }),
        mkdir(outsideMemoryDir, { recursive: true })
      ]);
      await Promise.all([
        writeFile(
          path.join(outsideMemoryDir, "constitution.json"),
          JSON.stringify({
            ...validConstitution,
            title: `${validConstitution.title} ${EXTERNAL_SENTINEL}`
          }),
          "utf8"
        ),
        writeFile(
          path.join(outsideMemoryDir, "project-summary.md"),
          `# ${EXTERNAL_SENTINEL}\n`,
          "utf8"
        )
      ]);
      await symlink(outsideMemoryDir, memoryLinkPath, "dir");

      const reader = createArtifactReader(rootDir);

      expectContainedReadFailure(
        await reader.constitutionArtifact(),
        constitutionPath,
        EXTERNAL_SENTINEL
      );
      expectContainedReadFailure(await reader.projectSummary(), summaryPath, EXTERNAL_SENTINEL);
    }
  );

  it.skipIf(process.platform === "win32")(
    "classifies a dangling intermediate directory symlink as unreadable rather than missing",
    async () => {
      const memoryLinkPath = path.join(rootDir, ".visp", "memory");
      const constitutionPath = path.join(memoryLinkPath, "constitution.json");
      const summaryPath = path.join(memoryLinkPath, "project-summary.md");
      await mkdir(path.dirname(memoryLinkPath), { recursive: true });
      await symlink(path.join(outsideDir, "missing-memory"), memoryLinkPath, "dir");

      const reader = createArtifactReader(rootDir);

      expectContainedReadFailure(
        await reader.constitutionArtifact(),
        constitutionPath,
        "DANGLING_TARGET_SENTINEL"
      );
      expectContainedReadFailure(
        await reader.projectSummary(),
        summaryPath,
        "DANGLING_TARGET_SENTINEL"
      );
    }
  );

  it.skipIf(process.platform === "win32")(
    "rejects final JSON and text symlinks even when their targets remain inside the reader root",
    async () => {
      const memoryDir = path.join(rootDir, ".visp", "memory");
      const constitutionPath = path.join(memoryDir, "constitution.json");
      const summaryPath = path.join(memoryDir, "project-summary.md");
      const targetConstitutionPath = path.join(memoryDir, "actual-constitution.json");
      const targetSummaryPath = path.join(memoryDir, "actual-project-summary.md");
      const insideSentinel = "VISP_IN_ROOT_SYMLINK_SENTINEL";
      await mkdir(memoryDir, { recursive: true });
      await Promise.all([
        writeFile(
          targetConstitutionPath,
          JSON.stringify({ ...validConstitution, title: insideSentinel }),
          "utf8"
        ),
        writeFile(targetSummaryPath, `# ${insideSentinel}\n`, "utf8")
      ]);
      await Promise.all([
        symlink(path.basename(targetConstitutionPath), constitutionPath),
        symlink(path.basename(targetSummaryPath), summaryPath)
      ]);

      const reader = createArtifactReader(rootDir);

      expectContainedReadFailure(
        await reader.constitutionArtifact(),
        constitutionPath,
        insideSentinel
      );
      expectContainedReadFailure(await reader.projectSummary(), summaryPath, insideSentinel);
    }
  );
});
