import { describe, expect, it } from "vitest";

import {
  RETRIEVAL_INPUT_LABELS,
  retrievalInputContentHash
} from "../../../src/context/retrieval-inputs.js";
import { fileIndexCacheSchema } from "../../../src/scanner/file-index-cache.js";

const indexEntry = (overrides: Record<string, unknown> = {}) => ({
  path: "src/a.ts",
  extension: ".ts",
  sizeBytes: 10,
  hash: "aaa",
  language: "TypeScript",
  isTestFile: false,
  isConfigFile: false,
  isRecognisedTextFile: true,
  lastScannedAt: "2026-01-01T00:00:00.000Z",
  ...overrides
});

describe("what the pack's provenance can now name", () => {
  it("ignores the scan timestamp, so a re-scan that changed nothing is not drift", () => {
    const before = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileIndex,
      raw: { files: [indexEntry()] }
    });
    const after = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileIndex,
      raw: { files: [indexEntry({ lastScannedAt: "2026-06-06T00:00:00.000Z" })] }
    });

    expect(before).toBeDefined();
    expect(after).toBe(before);
  });

  it("notices a file whose content moved", () => {
    const before = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileIndex,
      raw: { files: [indexEntry()] }
    });
    const after = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileIndex,
      raw: { files: [indexEntry({ hash: "bbb" })] }
    });

    expect(after).not.toBe(before);
  });

  it("does not depend on the order entries happen to be written in", () => {
    const one = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileSummaries,
      raw: {
        items: [
          { path: "src/b.ts", hash: "2" },
          { path: "src/a.ts", hash: "1" }
        ]
      }
    });
    const other = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.fileSummaries,
      raw: {
        items: [
          { path: "src/a.ts", hash: "1" },
          { path: "src/b.ts", hash: "2" }
        ]
      }
    });

    expect(one).toBe(other);
  });

  it("names a projection by intel's own two snapshot ids, and tells two builds apart", () => {
    const projection = (overrides: Record<string, unknown> = {}) => ({
      identity: {
        repositoryInstanceId: "urn:repo",
        snapshotId: "urn:snap",
        headSnapshotId: "urn:snap"
      },
      nodes: { rows: [[], []] },
      edges: { rows: [[]] },
      ...overrides
    });

    const base = retrievalInputContentHash({
      label: RETRIEVAL_INPUT_LABELS.intelProjection,
      raw: projection()
    });

    expect(base).toBeDefined();
    expect(
      retrievalInputContentHash({
        label: RETRIEVAL_INPUT_LABELS.intelProjection,
        raw: projection({
          identity: {
            repositoryInstanceId: "urn:repo",
            snapshotId: "urn:other",
            headSnapshotId: "urn:other"
          }
        })
      })
    ).not.toBe(base);
    // Rebuilt at the same head with more rows in it: a different artifact.
    expect(
      retrievalInputContentHash({
        label: RETRIEVAL_INPUT_LABELS.intelProjection,
        raw: projection({ nodes: { rows: [[], [], []] } })
      })
    ).not.toBe(base);
  });

  /**
   * `undefined` means UNVERIFIABLE and never means CHANGED. The drift check
   * reads it as "could not look", which is the reason it is worth stating here:
   * an artifact in an unexpected shape must not be reported as stale.
   */
  it("declines rather than guesses when the artifact is not the shape it expects", () => {
    expect(
      retrievalInputContentHash({ label: RETRIEVAL_INPUT_LABELS.fileIndex, raw: { files: "no" } })
    ).toBeUndefined();
    expect(retrievalInputContentHash({ label: "something else", raw: {} })).toBeUndefined();
  });
});

describe("the file index's language-recognition flag", () => {
  it("reads a cache written before the field was renamed", () => {
    const { isRecognisedTextFile: _dropped, ...legacyEntry } = indexEntry();
    const parsed = fileIndexCacheSchema.safeParse({
      files: [{ ...legacyEntry, isSourceFile: true }]
    });

    // A cache Kit refuses does not fail loudly — it makes the context pack
    // silently lose every file summary, which would make Kit's behaviour depend
    // on when the project was last scanned.
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.files[0]?.isRecognisedTextFile).toBe(true);
  });

  it("prefers the current spelling and defaults to false when neither is present", () => {
    const { isRecognisedTextFile: _dropped, ...bare } = indexEntry();

    expect(
      fileIndexCacheSchema.parse({
        files: [{ ...bare, isRecognisedTextFile: false, isSourceFile: true }]
      }).files[0]?.isRecognisedTextFile
    ).toBe(false);
    expect(fileIndexCacheSchema.parse({ files: [bare] }).files[0]?.isRecognisedTextFile).toBe(
      false
    );
  });
});
