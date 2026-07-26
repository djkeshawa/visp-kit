import { type ZodError } from "zod";

import { VispError } from "../core/errors.js";

function formatIssuePath(path: readonly (string | number)[]): string {
  return path.length > 0 ? path.map(String).join(".") : "(root)";
}

/**
 * Accepted keys for the object schema at `path`, when it can be resolved.
 *
 * Zod reports which key was rejected but never which keys are allowed, so an
 * author who guessed a field name has to open the schema source to find the real
 * one. Resolving the shape here turns a guess-and-retry loop into one edit.
 */
/** The internal Zod fields this walk relies on, named rather than typed as `any`. */
type SchemaNode = {
  readonly _def?: {
    readonly shape?: () => Record<string, unknown>;
    readonly innerType?: unknown;
    readonly schema?: unknown;
    readonly type?: unknown;
    readonly typeName?: string;
  };
};

function asNode(value: unknown): SchemaNode | undefined {
  return typeof value === "object" && value !== null ? (value as SchemaNode) : undefined;
}

/** Peels wrappers (optional, default, effects, array) that do not change shape. */
function unwrapSchema(value: unknown): SchemaNode | undefined {
  let node = asNode(value);

  for (let depth = 0; depth < 10 && node !== undefined; depth += 1) {
    const def = node._def;

    if (def === undefined) return node;
    if (def.innerType !== undefined) node = asNode(def.innerType);
    else if (def.schema !== undefined) node = asNode(def.schema);
    else if (def.typeName === "ZodArray" && def.type !== undefined) node = asNode(def.type);
    else return node;
  }

  return node;
}

function acceptedKeysAt(schema: unknown, path: readonly (string | number)[]): string[] | undefined {
  let current: unknown = schema;

  for (const segment of path) {
    if (typeof segment === "number") continue; // array index: shape is unchanged

    const shape = unwrapSchema(current)?._def?.shape;

    if (typeof shape !== "function") return undefined;

    current = shape()[segment];

    if (current === undefined) return undefined;
  }

  const shape = unwrapSchema(current)?._def?.shape;

  return typeof shape === "function" ? Object.keys(shape()).sort() : undefined;
}

export function formatValidationError(
  error: ZodError,
  artifactName = "artifact",
  schema?: unknown
): string {
  const lines = [`Invalid ${artifactName}:`];

  for (const issue of error.issues) {
    lines.push(`- ${formatIssuePath(issue.path)}: ${issue.message}`);

    if (schema !== undefined && issue.code === "unrecognized_keys") {
      // The rejected key sits alongside its siblings, so resolve the parent.
      const accepted = acceptedKeysAt(schema, issue.path);
      if (accepted !== undefined && accepted.length > 0) {
        lines.push(`    accepted keys here: ${accepted.join(", ")}`);
      }
    }
  }

  return lines.join("\n");
}

export function createArtifactValidationError(
  error: ZodError,
  artifactName: string,
  artifactPath?: string,
  schema?: unknown
): VispError {
  return new VispError("VALIDATION_FAILED", formatValidationError(error, artifactName, schema), {
    cause: error,
    details: {
      artifactName,
      artifactPath,
      issues: error.issues.map((issue) => ({
        path: formatIssuePath(issue.path),
        message: issue.message,
        code: issue.code
      }))
    }
  });
}
