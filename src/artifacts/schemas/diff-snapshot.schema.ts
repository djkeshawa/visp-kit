import { createHash } from "node:crypto";
import { z } from "zod";

import { assuranceCasePathSchema } from "./assurance-case.schema.js";
import { idSchema, nonEmptyStringSchema } from "./common.schema.js";
import { oracleSha256Schema } from "./oracle-plan.schema.js";
import { hashOracleText, hashOracleValue } from "../../oracle/oracle-authorization.js";
import { canonicalJsonV1 } from "../../integration/canonical-json.js";

export const diffSnapshotLayerSchema = z.enum(["committed", "staged", "unstaged", "untracked"]);

export const diffSnapshotChangeUnitSchema = z.discriminatedUnion("kind", [
  z
    .object({
      id: idSchema,
      kind: z.literal("hunk"),
      layer: diffSnapshotLayerSchema,
      path: assuranceCasePathSchema,
      oldStart: z.number().int().nonnegative(),
      oldLines: z.number().int().nonnegative(),
      newStart: z.number().int().nonnegative(),
      newLines: z.number().int().nonnegative(),
      patch: nonEmptyStringSchema,
      patchSha256: oracleSha256Schema,
      occurrence: z.number().int().positive()
    })
    .strict(),
  z
    .object({
      id: idSchema,
      kind: z.literal("file"),
      layer: diffSnapshotLayerSchema,
      category: z.enum(["binary", "rename", "mode", "empty"]),
      detail: nonEmptyStringSchema,
      detailSha256: oracleSha256Schema,
      beforePath: assuranceCasePathSchema.optional(),
      afterPath: assuranceCasePathSchema.optional(),
      beforeMode: z
        .string()
        .regex(/^[0-7]{6}$/u)
        .optional(),
      afterMode: z
        .string()
        .regex(/^[0-7]{6}$/u)
        .optional()
    })
    .strict()
]);

export type DiffSnapshotChangeUnit = z.infer<typeof diffSnapshotChangeUnitSchema>;

export function diffSnapshotChangeUnitIdentity(unit: DiffSnapshotChangeUnit): unknown {
  return unit.kind === "hunk"
    ? {
        kind: unit.kind,
        layer: unit.layer,
        path: unit.path,
        oldStart: unit.oldStart,
        oldLines: unit.oldLines,
        newStart: unit.newStart,
        newLines: unit.newLines,
        patchSha256: unit.patchSha256,
        occurrence: unit.occurrence
      }
    : {
        kind: unit.kind,
        layer: unit.layer,
        category: unit.category,
        detailSha256: unit.detailSha256,
        beforePath: unit.beforePath ?? null,
        afterPath: unit.afterPath ?? null,
        beforeMode: unit.beforeMode ?? null,
        afterMode: unit.afterMode ?? null
      };
}

export function createDiffSnapshotChangeUnitId(unit: DiffSnapshotChangeUnit): string {
  return `CU-${createHash("sha256")
    .update("visp.diff-change-unit\0canonical-1.0\0", "utf8")
    .update(canonicalJsonV1(diffSnapshotChangeUnitIdentity(unit)), "utf8")
    .digest("hex")}`;
}

export const diffSnapshotWithoutHashSchema = z
  .object({
    version: z.literal("1.0"),
    mode: z.enum(["base_to_workspace", "base_to_commit"]),
    baseRevision: nonEmptyStringSchema,
    targetRevision: nonEmptyStringSchema,
    state: z
      .object({
        headRevision: z.string().regex(/^[a-f0-9]{40,64}$/u),
        indexTreeRevision: z.string().regex(/^[a-f0-9]{40,64}$/u),
        implementationSha256: oracleSha256Schema,
        stateSha256: oracleSha256Schema
      })
      .strict(),
    changeUnits: z.array(diffSnapshotChangeUnitSchema)
  })
  .strict();

export const diffSnapshotSchema = diffSnapshotWithoutHashSchema
  .extend({
    snapshotSha256: oracleSha256Schema
  })
  .strict()
  .superRefine((snapshot, context) => {
    const ids = new Set<string>();
    const occurrences = new Map<string, number[]>();

    for (const [index, unit] of snapshot.changeUnits.entries()) {
      if (ids.has(unit.id)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits", index, "id"],
          message: `Duplicate change unit ID: ${unit.id}.`
        });
      }
      if (index > 0 && snapshot.changeUnits[index - 1]!.id >= unit.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits", index, "id"],
          message: "Change unit IDs must be sorted."
        });
      }
      ids.add(unit.id);
      if (createDiffSnapshotChangeUnitId(unit) !== unit.id) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits", index, "id"],
          message: "Change unit ID does not match its canonical identity."
        });
      }

      if (unit.kind === "hunk") {
        if (hashOracleText(unit.patch) !== unit.patchSha256) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "patchSha256"],
            message: "Hunk patch hash does not match its normalized patch."
          });
        }
        const key = `${unit.path}\0${unit.patchSha256}`;
        occurrences.set(key, [...(occurrences.get(key) ?? []), unit.occurrence]);
      } else {
        if (hashOracleText(unit.detail) !== unit.detailSha256) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "detailSha256"],
            message: "File detail hash does not match its normalized detail."
          });
        }
        if (unit.beforePath === undefined && unit.afterPath === undefined) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "beforePath"],
            message: "File units require a before or after path."
          });
        }
        if (
          unit.category === "rename" &&
          (unit.beforePath === undefined ||
            unit.afterPath === undefined ||
            unit.beforePath === unit.afterPath)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "category"],
            message: "Rename units require distinct before and after paths."
          });
        }
        if (
          unit.category === "mode" &&
          unit.beforeMode === undefined &&
          unit.afterMode === undefined
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "category"],
            message: "Mode units require a before or after mode."
          });
        }
        if (
          unit.category !== "mode" &&
          (unit.beforeMode !== undefined || unit.afterMode !== undefined)
        ) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["changeUnits", index, "category"],
            message: "Only mode units may carry file modes."
          });
        }
      }
    }

    for (const values of occurrences.values()) {
      const sorted = [...values].sort((left, right) => left - right);
      if (sorted.some((value, index) => value !== index + 1)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits"],
          message: "Duplicate hunk occurrences must be exactly 1..N."
        });
      }
    }

    if (snapshot.state.implementationSha256 !== hashOracleValue(snapshot.changeUnits)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state", "implementationSha256"],
        message: "Implementation state hash does not match captured change units."
      });
    }
    const { stateSha256, ...stateMaterial } = snapshot.state;
    if (stateSha256 !== hashOracleValue(stateMaterial)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["state", "stateSha256"],
        message: "Git state hash does not match its canonical material."
      });
    }

    const commitPattern = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u;
    if (!commitPattern.test(snapshot.baseRevision)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["baseRevision"],
        message: "Base revision must be a full commit hash."
      });
    }
    if (snapshot.mode === "base_to_commit") {
      if (!commitPattern.test(snapshot.targetRevision)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetRevision"],
          message: "Committed target revision must be a full commit hash."
        });
      }
      if (snapshot.changeUnits.some((unit) => unit.layer !== "committed")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits"],
          message: "Committed snapshots may contain only committed units."
        });
      }
    } else {
      if (snapshot.targetRevision !== "WORKSPACE") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["targetRevision"],
          message: "Workspace snapshots require target revision WORKSPACE."
        });
      }
      if (snapshot.changeUnits.some((unit) => unit.layer === "committed")) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["changeUnits"],
          message: "Workspace snapshots cannot contain committed units."
        });
      }
    }

    const { snapshotSha256, ...withoutHash } = snapshot;
    if (hashOracleValue(withoutHash) !== snapshotSha256) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["snapshotSha256"],
        message: "Snapshot hash does not match the canonical diff snapshot."
      });
    }
  });

export type DiffSnapshotWithoutHash = z.infer<typeof diffSnapshotWithoutHashSchema>;
export type DiffSnapshot = z.infer<typeof diffSnapshotSchema>;
