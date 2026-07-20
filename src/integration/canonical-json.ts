import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

export type Sha256Hash = `sha256:${string}`;

export const workflowActionIdentityDomain = "visp.workflow-action\0canonical-1.0\0";

export function compareUtf16CodeUnits(left: string, right: string): number {
  const length = Math.min(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference !== 0) return difference;
  }

  return left.length - right.length;
}

function serializationError(reason: string, path: string): never {
  throw new TypeError(`canonical-json-v1: ${reason} at ${path}`);
}

function propertyPath(parent: string, key: string): string {
  return `${parent}[${JSON.stringify(key)}]`;
}

function primitiveJson(value: string | number): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return serializationError("value cannot be serialized", "$");
  return serialized;
}

function assertDataProperty(
  descriptor: PropertyDescriptor | undefined,
  path: string
): asserts descriptor is PropertyDescriptor & { value: unknown } {
  if (
    descriptor === undefined ||
    descriptor.enumerable !== true ||
    !("value" in descriptor) ||
    descriptor.get !== undefined ||
    descriptor.set !== undefined
  ) {
    serializationError("container properties must be enumerable data properties", path);
  }
}

function serializeArray(value: unknown[], path: string, ancestors: WeakSet<object>): string {
  if (Object.getPrototypeOf(value) !== Array.prototype) {
    return serializationError("array subclasses are unsupported", path);
  }

  const ownKeys = Reflect.ownKeys(value);
  for (const key of ownKeys) {
    if (typeof key === "symbol") {
      serializationError("symbol-keyed properties are unsupported", path);
    }
    if (key === "length") continue;

    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= value.length || String(index) !== key) {
      serializationError("custom array properties are unsupported", propertyPath(path, key));
    }
  }

  const items: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const itemPath = `${path}[${index}]`;
    if (!Object.hasOwn(value, index)) serializationError("sparse arrays are unsupported", itemPath);
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    assertDataProperty(descriptor, itemPath);
    items.push(serializeJsonValue(descriptor.value, itemPath, ancestors));
  }

  return `[${items.join(",")}]`;
}

function serializeRecord(value: object, path: string, ancestors: WeakSet<object>): string {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return serializationError("only plain objects are supported", path);
  }

  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key === "symbol")) {
    return serializationError("symbol-keyed properties are unsupported", path);
  }

  const keys = (ownKeys as string[]).sort(compareUtf16CodeUnits);
  const members: string[] = [];
  for (const key of keys) {
    const itemPath = propertyPath(path, key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assertDataProperty(descriptor, itemPath);
    members.push(
      `${primitiveJson(key)}:${serializeJsonValue(descriptor.value, itemPath, ancestors)}`
    );
  }

  return `{${members.join(",")}}`;
}

function serializeJsonValue(value: unknown, path: string, ancestors: WeakSet<object>): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "string":
      return primitiveJson(value);
    case "number":
      if (!Number.isFinite(value)) return serializationError("numbers must be finite", path);
      return primitiveJson(value);
    case "object": {
      if (isProxy(value)) return serializationError("proxy containers are unsupported", path);
      if (ancestors.has(value))
        return serializationError("cyclic references are unsupported", path);
      ancestors.add(value);
      try {
        return Array.isArray(value)
          ? serializeArray(value, path, ancestors)
          : serializeRecord(value, path, ancestors);
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      return serializationError(`${typeof value} values are unsupported`, path);
  }
}

export function canonicalJsonV1(value: unknown): string {
  return serializeJsonValue(value, "$", new WeakSet());
}

export function createWorkflowActionId(actionWithoutId: unknown): Sha256Hash {
  const digest = createHash("sha256")
    .update(workflowActionIdentityDomain, "utf8")
    .update(canonicalJsonV1(actionWithoutId), "utf8")
    .digest("hex");

  return `sha256:${digest}`;
}
