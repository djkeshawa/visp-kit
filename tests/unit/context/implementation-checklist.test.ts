import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  contextChecklistJsonPath,
  contextChecklistPath
} from "../../../src/artifacts/artifact-paths.js";
import {
  createImplementationChecklistArtifact,
  markImplementationChecklistSteps,
  renderImplementationChecklistMarkdown,
  updateImplementationChecklistItem
} from "../../../src/context/implementation-checklist.js";

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
    const checklistJson = contextChecklistJsonPath(tempDir, "001-add-note-pinning", "T001");
    const artifact = createImplementationChecklistArtifact({
      featureId: "001",
      featureSlug: "add-note-pinning",
      taskId: "T001",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    await mkdir(path.dirname(checklist), { recursive: true });
    await writeFile(checklistJson, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(checklist, renderImplementationChecklistMarkdown(artifact), "utf8");

    const result = await markImplementationChecklistSteps({
      targetPath: tempDir,
      featureKey: "001-add-note-pinning",
      taskId: "T001",
      steps: ["record-usage", "verify"],
      dryRun: false
    });

    expect(result.ok).toBe(true);
    const updated = await readFile(checklist, "utf8");
    const updatedJson = JSON.parse(await readFile(checklistJson, "utf8")) as {
      items: Array<{ id: string; status: string; evidence: string | null }>;
    };

    expect(updated).toContain("- [x] Record actual token usage");
    expect(updated).toContain("- [x] Run validation commands");
    expect(updated).toContain("- [ ] Run `visp review --task T001`.");
    expect(updatedJson.items.find((item) => item.id === "record-usage")?.status).toBe("done");
    expect(updatedJson.items.find((item) => item.id === "verify")?.status).toBe("done");
  });

  it("records unavailable usage as an explicit checklist status", async () => {
    const checklist = contextChecklistPath(tempDir, "001-add-note-pinning", "T001");
    const checklistJson = contextChecklistJsonPath(tempDir, "001-add-note-pinning", "T001");
    const artifact = createImplementationChecklistArtifact({
      featureId: "001",
      featureSlug: "add-note-pinning",
      taskId: "T001",
      generatedAt: "2026-01-01T00:00:00.000Z"
    });

    await mkdir(path.dirname(checklist), { recursive: true });
    await writeFile(checklistJson, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    await writeFile(checklist, renderImplementationChecklistMarkdown(artifact), "utf8");

    const result = await updateImplementationChecklistItem({
      targetPath: tempDir,
      featureKey: "001-add-note-pinning",
      taskId: "T001",
      itemId: "record-usage",
      status: "unavailable",
      reason: "Agent surface did not expose numeric token usage.",
      dryRun: false,
      now: "2026-01-01T01:00:00.000Z"
    });

    expect(result.ok).toBe(true);
    const updatedJson = JSON.parse(await readFile(checklistJson, "utf8")) as {
      items: Array<{ id: string; status: string; reason: string | null }>;
    };
    const updatedMarkdown = await readFile(checklist, "utf8");

    expect(updatedJson.items.find((item) => item.id === "record-usage")).toMatchObject({
      status: "unavailable",
      reason: "Agent surface did not expose numeric token usage."
    });
    expect(updatedMarkdown).toContain("unavailable");
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
