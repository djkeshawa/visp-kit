import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type UnderstandingCaseExport } from "../../../src/artifacts/schemas/understanding.schema.js";
import {
  readUnderstandingExport,
  understandingCurrentness,
  understandingExportObjections
} from "../../../src/understanding/understanding-export.js";
import { understandingView } from "../../../src/understanding/understanding-view.js";

const HANDLER_A = "urn:visp-intel:entity:1.0:sha256:aaaa";
const HANDLER_B = "urn:visp-intel:entity:1.0:sha256:bbbb";
const TEST_ENTITY = "urn:visp-intel:entity:1.0:sha256:cccc";

function fixture(overrides: Partial<UnderstandingCaseExport> = {}): UnderstandingCaseExport {
  const base: UnderstandingCaseExport = {
    kind: "understanding-case-export",
    schemaVersion: "1.0",
    case: {
      schemaVersion: "1.0",
      authority: "descriptive",
      authorizationEffect: "none",
      id: "urn:visp-intel:understanding-case:1.0:sha256:case",
      taskStateId: "urn:visp-intel:task-state:1.0:sha256:state",
      taskId: "T001",
      snapshotId: "urn:visp-intel:snapshot:1.0:sha256:snap",
      behavioralQuestion: "How does a pinned note reach the sort?",
      observations: [],
      hypotheses: [
        {
          id: "H2",
          statement: "Sorting reads the pinned flag.",
          status: "supported",
          evidenceIds: ["urn:visp-intel:evidence:1.0:sha256:e1"]
        },
        {
          id: "H1",
          statement: "Pin state is never persisted.",
          status: "unresolved",
          evidenceIds: []
        }
      ],
      entrypointIds: [HANDLER_A],
      relationIds: ["urn:visp-intel:relation:1.0:sha256:r1"],
      evidenceIds: ["urn:visp-intel:evidence:1.0:sha256:e1"],
      unknownIds: [],
      candidateChangeEntityIds: [HANDLER_B],
      affectedUnchangedEntityIds: [],
      affectedTestIds: [TEST_ENTITY],
      queryReceiptIds: [],
      impactQueryReceiptIds: [],
      validationSuggestions: []
    },
    resolution: {
      [HANDLER_A]: {
        kind: "function",
        filePath: "src/notes.ts",
        startLine: 6,
        endLine: 8,
        signature: "function src/notes.ts#pinNote",
        displayName: "pinNote"
      },
      [HANDLER_B]: {
        kind: "function",
        filePath: "src/sort.ts",
        startLine: 0,
        endLine: 4,
        signature: "function src/sort.ts#pinNote",
        displayName: "pinNote"
      },
      [TEST_ENTITY]: {
        kind: "test",
        filePath: "tests/notes.test.ts",
        startLine: 2,
        endLine: 4,
        signature: "test tests/notes.test.ts#pinNote",
        displayName: "pinNote"
      }
    },
    identity: {
      repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
      snapshotId: "urn:visp-intel:snapshot:1.0:sha256:snap",
      headSnapshotId: "urn:visp-intel:snapshot:1.0:sha256:snap",
      gitCommit: "a".repeat(40),
      dirty: false,
      worktreeFingerprint: "f".repeat(64)
    },
    path: [
      {
        relationId: "urn:visp-intel:relation:1.0:sha256:r1",
        sourceId: HANDLER_A,
        targetId: HANDLER_B,
        kind: "calls",
        evidenceId: "urn:visp-intel:evidence:1.0:sha256:e1"
      }
    ],
    counts: {
      entrypoints: 1,
      pathRelations: 1,
      candidateChanges: 1,
      affectedUnchanged: 0,
      affectedTests: 1,
      unknowns: 0
    }
  };

  return { ...base, ...overrides };
}

describe("understanding case export", () => {
  it("accepts an internally consistent export", () => {
    expect(understandingExportObjections(fixture())).toEqual([]);
  });

  it("rejects an export that claims any authority at all", () => {
    const value = fixture();
    const objections = understandingExportObjections({
      ...value,
      case: { ...value.case, authority: "normative" }
    });

    expect(objections[0]).toContain("authority");
    // Authority is checked FIRST and alone: nothing else about the artifact
    // matters once it claims to decide something.
    expect(objections).toHaveLength(1);
  });

  it("rejects an export whose counts disagree with its own arrays", () => {
    const value = fixture();
    const objections = understandingExportObjections({
      ...value,
      counts: { ...value.counts, pathRelations: 4 }
    });

    expect(objections.join(" ")).toContain("counts disagree");
  });

  it("rejects resolution keys unreachable from the case", () => {
    const value = fixture();
    const objections = understandingExportObjections({
      ...value,
      resolution: {
        ...value.resolution,
        "urn:visp-intel:entity:1.0:sha256:stray": {
          kind: "function",
          filePath: "src/other.ts",
          startLine: 0,
          endLine: 1,
          signature: "function src/other.ts#other",
          displayName: "other"
        }
      }
    });

    expect(objections.join(" ")).toContain("unreachable from the case");
  });

  it("rejects a partial resolution map", () => {
    const value = fixture();
    const { [TEST_ENTITY]: _dropped, ...rest } = value.resolution;
    const objections = understandingExportObjections({ ...value, resolution: rest });

    expect(objections.join(" ")).toContain("partial");
  });
});

describe("understanding currentness", () => {
  const scanRepositoryInstanceId = "urn:visp-intel:repository-instance:1.0:sha256:repo";
  const baseCommit = "a".repeat(40);

  it("is current when snapshot, instance, commit and cleanliness all agree", () => {
    expect(
      understandingCurrentness({ export: fixture(), scanRepositoryInstanceId, baseCommit }).current
    ).toBe(true);
  });

  it("is not current for a different repository instance at the same path", () => {
    const result = understandingCurrentness({
      export: fixture(),
      scanRepositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:reclone",
      baseCommit
    });

    expect(result.current).toBe(false);
    expect(result.reasons.join(" ")).toContain("different repository instance");
  });

  it("is not current when the index is behind head", () => {
    const value = fixture();
    const result = understandingCurrentness({
      export: {
        ...value,
        identity: {
          ...value.identity,
          headSnapshotId: "urn:visp-intel:snapshot:1.0:sha256:newer"
        }
      },
      scanRepositoryInstanceId,
      baseCommit
    });

    expect(result.current).toBe(false);
  });

  it("is not current when the repository was indexed without git identity", () => {
    const value = fixture();
    const result = understandingCurrentness({
      export: {
        ...value,
        identity: { ...value.identity, gitCommit: null, dirty: null }
      },
      scanRepositoryInstanceId,
      baseCommit
    });

    expect(result.current).toBe(false);
  });

  it("is not current when the worktree was dirty", () => {
    const value = fixture();
    const result = understandingCurrentness({
      export: { ...value, identity: { ...value.identity, dirty: true } },
      scanRepositoryInstanceId,
      baseCommit
    });

    expect(result.current).toBe(false);
  });
});

describe("understanding view", () => {
  it("renders one-based lines from intel's zero-based spans", () => {
    const view = understandingView({ export: fixture(), current: true, currentnessReasons: [] });

    // resolution startLine 6 is the seventh line of the file.
    expect(view.path[0]?.sourceLine).toBe(7);
    // A zero span must become line 1, never stay 0 and never become null.
    expect(view.path[0]?.targetLine).toBe(1);
    expect(view.affectedTests[0]?.line).toBe(3);
  });

  it("keeps two identically named entities apart by id", () => {
    const view = understandingView({ export: fixture(), current: true, currentnessReasons: [] });
    const names = view.signatures.map((signature) => signature.displayName);

    // Both entities are called `pinNote`. They are two identities and both
    // survive; a map keyed on the display name would have kept one.
    expect(names.filter((name) => name === "pinNote").length).toBeGreaterThanOrEqual(2);
    expect(new Set(view.signatures.map((signature) => signature.entityId)).size).toBe(
      view.signatures.length
    );
  });

  it("puts unresolved hypotheses first", () => {
    const view = understandingView({ export: fixture(), current: true, currentnessReasons: [] });

    expect(view.hypotheses[0]?.status).toBe("unresolved");
  });

  it("never claims the cited rows are a traversal order", () => {
    const view = understandingView({ export: fixture(), current: true, currentnessReasons: [] });

    expect(view.pathOrdering).toBe("cited");
  });
});

describe("reading the export from disk", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-understanding-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  async function writeExport(taskId: string, value: unknown): Promise<void> {
    await mkdir(path.join(tempDir, ".visp-intel", "understanding"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".visp-intel", "understanding", `${taskId}.json`),
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8"
    );
  }

  it("degrades to undefined with a warning when the export is absent", async () => {
    const warnings: string[] = [];

    expect(
      await readUnderstandingExport({ targetPath: tempDir, taskId: "T001", warnings })
    ).toBeUndefined();
    expect(warnings.join(" ")).toContain("understanding case export");
  });

  it("reads a valid export", async () => {
    await writeExport("T001", fixture());
    const warnings: string[] = [];

    expect(
      await readUnderstandingExport({ targetPath: tempDir, taskId: "T001", warnings })
    ).toBeDefined();
  });

  it("refuses a task id that could name a file outside the store", async () => {
    const warnings: string[] = [];

    expect(
      await readUnderstandingExport({
        targetPath: tempDir,
        taskId: "../../etc/passwd",
        warnings
      })
    ).toBeUndefined();
    expect(warnings.join(" ")).toContain("cannot name an understanding export file");
  });

  it("ignores an export that names a different task", async () => {
    await writeExport("T001", {
      ...fixture(),
      case: { ...fixture().case, taskId: "T999" }
    });
    const warnings: string[] = [];

    expect(
      await readUnderstandingExport({ targetPath: tempDir, taskId: "T001", warnings })
    ).toBeUndefined();
    expect(warnings.join(" ")).toContain("names task T999");
  });
});
