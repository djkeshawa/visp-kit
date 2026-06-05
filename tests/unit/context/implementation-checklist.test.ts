import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { contextChecklistPath } from "../../../src/artifacts/artifact-paths.js";
import { markImplementationChecklistSteps } from "../../../src/context/implementation-checklist.js";

describe("implementation checklist updater", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-checklist-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("marks selected evidence-backed checklist steps", async () => {
    const checklist = contextChecklistPath(tempDir, "001-add-note-pinning", "T001");

    await mkdir(path.dirname(checklist), { recursive: true });
    await writeFile(
      checklist,
      `# Implementation Checklist: T001

- [ ] Record actual token usage with \`visp budget --task T001 --record-usage --input-tokens <n> --output-tokens <n> --write-report\` when available.
- [ ] Run \`visp verify --task T001\`.
- [ ] Run \`visp review --task T001\`.
`,
      "utf8"
    );

    const result = await markImplementationChecklistSteps({
      targetPath: tempDir,
      featureKey: "001-add-note-pinning",
      taskId: "T001",
      steps: ["record-usage", "verify"],
      dryRun: false
    });

    expect(result.ok).toBe(true);
    const updated = await readFile(checklist, "utf8");

    expect(updated).toContain("- [x] Record actual token usage");
    expect(updated).toContain("- [x] Run `visp verify --task T001`.");
    expect(updated).toContain("- [ ] Run `visp review --task T001`.");
  });

  it("does nothing when the checklist is missing", async () => {
    const result = await markImplementationChecklistSteps({
      targetPath: tempDir,
      featureKey: "001-add-note-pinning",
      taskId: "T001",
      steps: ["verify"],
      dryRun: false
    });

    expect(result.ok).toBe(true);
  });
});
