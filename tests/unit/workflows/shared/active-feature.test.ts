import { mkdir, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { writeArtifact } from "../../../../src/artifacts/artifact-writer.js";
import { featureIntentSchema } from "../../../../src/artifacts/schemas/feature.schema.js";
import { isErr } from "../../../../src/core/result.js";
import { resolveActiveFeature } from "../../../../src/workflows/shared/active-feature.js";
import { runFeatureWorkflow } from "../../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

describe("resolveActiveFeature", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-active-feature-"));
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("resolves the active feature from status", async () => {
    const feature = expectOk(await resolveActiveFeature({ targetPath: tempDir }));

    expect(feature.id).toBe("001");
    expect(feature.slug).toBe("add-note-pinning");
  });

  it("resolves by numeric ID, slug, and folder name", async () => {
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Export notes as PDF"
      })
    );

    expect(expectOk(await resolveActiveFeature({ targetPath: tempDir, feature: "001" })).key).toBe(
      "001-add-note-pinning"
    );
    expect(
      expectOk(
        await resolveActiveFeature({
          targetPath: tempDir,
          feature: "export-notes-as-pdf"
        })
      ).key
    ).toBe("002-export-notes-as-pdf");
    expect(
      expectOk(
        await resolveActiveFeature({
          targetPath: tempDir,
          feature: "002-export-notes-as-pdf"
        })
      ).slug
    ).toBe("export-notes-as-pdf");
  });

  it("fails clearly for ambiguous selectors", async () => {
    const featureDir = path.join(tempDir, ".visp", "features", "002-a");
    await mkdir(featureDir, { recursive: true });
    expectOk(
      await writeArtifact(path.join(featureDir, "intent.json"), featureIntentSchema, {
        id: "002",
        slug: "a",
        title: "A",
        rawUserRequest: "A",
        status: "draft",
        budgetMode: "lean",
        riskLevel: "medium",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      })
    );
    await mkdir(path.join(tempDir, ".visp", "features", "003-b"), {
      recursive: true
    });
    await mkdir(path.join(tempDir, ".visp", "features", "003-a"), {
      recursive: true
    });

    const result = await resolveActiveFeature({
      targetPath: tempDir,
      feature: "a"
    });

    expect(isErr(result)).toBe(true);
    if (isErr(result)) expect(result.error.message).toContain("ambiguous");
  });
});
