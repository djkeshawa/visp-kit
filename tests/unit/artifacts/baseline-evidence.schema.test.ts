import { describe, expect, it } from "vitest";

import { baselineEvidenceSchema } from "../../../src/artifacts/schemas/baseline-evidence.schema.js";

const hash = `sha256:${"a".repeat(64)}`;

describe("baselineEvidenceSchema", () => {
  it("accepts structured baseline evidence with a complete cache identity", () => {
    const result = baselineEvidenceSchema.safeParse({
      version: "1.0",
      id: "BASELINE-001-T001",
      featureId: "001",
      featureSlug: "example",
      taskId: "T001",
      oraclePlan: { path: ".visp/oracle-plan.json", sha256: hash },
      originLockHash: hash,
      cacheKey: {
        version: "1.0",
        hash,
        baseCommit: { status: "captured", commit: "b".repeat(40) },
        commandSetSha256: hash,
        lockfiles: [{ path: "pnpm-lock.yaml", sha256: hash }],
        configurations: [{ path: "package.json", sha256: hash }],
        providers: [{ id: "command", version: "1.0" }],
        runtimes: [{ id: "node", major: 24 }],
        platform: "linux",
        architecture: "x64"
      },
      oracles: [
        {
          oracleId: "ORACLE-AC001",
          expected: "recorded",
          observed: "passed",
          expectationMet: true
        }
      ],
      commands: [],
      outcome: "passed",
      generatedAt: "2026-07-25T00:00:00.000Z"
    });

    expect(result.success).toBe(true);
  });
});
