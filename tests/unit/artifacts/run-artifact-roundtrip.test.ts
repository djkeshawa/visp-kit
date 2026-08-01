import { describe, expect, it } from "vitest";

import {
  runArtifactSchema,
  runEventSchema,
  runIndexSchema,
  type RunArtifact,
  type RunEvent,
  type RunIndex
} from "../../../src/artifacts/public.js";

const run: RunArtifact = {
  id: "RUN-000001",
  command: "verify",
  targetPath: "/workspace/project",
  featureId: "001",
  featureSlug: "artifact-reader",
  taskId: "T002",
  startedAt: "2026-08-01T09:00:00.000Z",
  endedAt: "2026-08-01T09:00:01.250Z",
  durationMs: 1250,
  success: true,
  result: "warnings",
  artifactWrites: [".visp/features/001-artifact-reader/verification.json"],
  estimatedTokens: 800,
  actualTokens: 730,
  warnings: ["One manual check remains."],
  errors: [],
  eventCount: 3
};

const runIndex: RunIndex = {
  latestRunId: run.id,
  runs: [
    {
      id: run.id,
      command: run.command,
      featureId: run.featureId,
      featureSlug: run.featureSlug,
      taskId: run.taskId,
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      success: run.success,
      result: run.result,
      runPath: `.visp/runs/${run.id}/run.json`
    }
  ]
};

const runEvent: RunEvent = {
  id: "EVT-000001",
  runId: run.id,
  type: "artifact_written",
  command: run.command,
  featureId: run.featureId,
  featureSlug: run.featureSlug,
  taskId: run.taskId,
  message: "Verification evidence was written.",
  artifactPath: ".visp/features/001-artifact-reader/verification.json",
  ruleId: "RULE-001",
  overrideId: "OVERRIDE-001",
  data: { evidenceCount: 4, accepted: true },
  createdAt: "2026-08-01T09:00:01.000Z"
};

describe("public run artifact schemas", () => {
  it.each([
    ["run artifact", runArtifactSchema, run],
    ["run index", runIndexSchema, runIndex],
    ["run event", runEventSchema, runEvent]
  ] as const)("round-trips a serialized %s", (_label, schema, value) => {
    const serialized = JSON.stringify(value);

    expect(schema.parse(JSON.parse(serialized))).toEqual(value);
  });
});
