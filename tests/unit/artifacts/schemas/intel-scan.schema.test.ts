import { describe, expect, it } from "vitest";

import {
  intelScanProvenanceSchema,
  intelScanProvenanceWriteSchema,
  intelStoreAbsenceReasons
} from "../../../../src/artifacts/schemas/intel-scan.schema.js";

const GENERATED_AT = "2026-01-01T00:00:00.000Z";

const store = {
  repositoryInstanceId: "urn:visp-intel:repository-instance:1.0:sha256:repo",
  headSnapshotId: "urn:visp-intel:snapshot:1.0:sha256:head",
  indexedFileCount: 12
};

/** The artifact exactly as a Kit without the absence field wrote it. */
const previousShape = {
  withStore: { generatedAt: GENERATED_AT, store },
  withoutStore: { generatedAt: GENERATED_AT, store: null }
};

describe("intel scan provenance, read contract", () => {
  it("parses the previous shape when the last scan recorded a store", () => {
    const parsed = intelScanProvenanceSchema.safeParse(previousShape.withStore);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.storeAbsenceReason).toBeUndefined();
  });

  /**
   * The direction that decides whether this field is additive. A file written
   * by a Kit that predates the field has `store: null` and no reason, and the
   * schema is `.strict()`, so a reader that required the reason would turn an
   * added key into a breaking change for every artifact already on disk.
   */
  it("parses the previous shape when the last scan recorded no store", () => {
    const parsed = intelScanProvenanceSchema.safeParse(previousShape.withoutStore);

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.store).toBeNull();
  });

  it("still refuses a key it does not know", () => {
    const parsed = intelScanProvenanceSchema.safeParse({
      ...previousShape.withoutStore,
      storeAbsenceReason: "intel_absent",
      note: "why not"
    });

    expect(parsed.success).toBe(false);
  });
});

describe("intel scan provenance, write contract", () => {
  it("refuses a null store with no reason", () => {
    const parsed = intelScanProvenanceWriteSchema.safeParse(previousShape.withoutStore);

    expect(parsed.success).toBe(false);
    expect(parsed.success === false && parsed.error.issues[0]?.path).toEqual([
      "storeAbsenceReason"
    ]);
  });

  it("accepts a null store with any reason the enumeration declares", () => {
    for (const storeAbsenceReason of intelStoreAbsenceReasons) {
      const parsed = intelScanProvenanceWriteSchema.safeParse({
        ...previousShape.withoutStore,
        storeAbsenceReason
      });

      expect(parsed.success).toBe(true);
    }
  });

  /**
   * The enumeration is closed because a field satisfiable by `""`, `"unknown"`
   * or an empty join records nothing anyone can count or act on — it would look
   * like an instrument and behave like a bare `null`.
   */
  it.each([
    "",
    "unknown",
    "none",
    "no intel store found"
  ])("refuses %j as a reason", (storeAbsenceReason) => {
    const parsed = intelScanProvenanceWriteSchema.safeParse({
      ...previousShape.withoutStore,
      storeAbsenceReason
    });

    expect(parsed.success).toBe(false);
  });

  it("refuses a reason alongside a store that was read", () => {
    const parsed = intelScanProvenanceWriteSchema.safeParse({
      ...previousShape.withStore,
      storeAbsenceReason: "intel_absent"
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a store with no reason", () => {
    expect(intelScanProvenanceWriteSchema.safeParse(previousShape.withStore).success).toBe(true);
  });
});
