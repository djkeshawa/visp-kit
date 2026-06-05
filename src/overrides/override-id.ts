import { type OverrideRecord } from "../artifacts/schemas/override.schema.js";

const overrideIdPattern = /^OVR(\d{3,})$/;

export function nextOverrideId(overrides: readonly Pick<OverrideRecord, "id">[]): string {
  const max = overrides.reduce((current, override) => {
    const match = overrideIdPattern.exec(override.id);

    if (match === null) return current;
    return Math.max(current, Number.parseInt(match[1] ?? "0", 10));
  }, 0);

  return `OVR${String(max + 1).padStart(3, "0")}`;
}
