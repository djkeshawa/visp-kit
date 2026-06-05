import { describe, expect, it } from "vitest";

import { workflowManifestSchema } from "../../../src/artifacts/schemas/workflow.schema.js";
import { defaultWorkflowManifest } from "../../../src/workflow-manifest/default-workflow.js";

describe("default workflow manifest", () => {
  it("contains the strict Visp workflow contract", () => {
    const manifest = defaultWorkflowManifest("2026-01-01T00:00:00.000Z");
    const parsed = workflowManifestSchema.safeParse(manifest);

    expect(parsed.success).toBe(true);
    expect(manifest.stages.map((stage) => stage.name)).toContain("implement");
    expect(manifest.stages.find((stage) => stage.name === "implement")?.sourceEditsAllowed).toBe(true);
    expect(manifest.principles.join(" ")).toContain("raw intent");
  });
});
