import { type PresetPack, presetPackSchema } from "../artifacts/schemas/preset.schema.js";

export function validatePresetPack(value: unknown): {
  readonly valid: boolean;
  readonly pack?: PresetPack;
  readonly error?: string;
} {
  const parsed = presetPackSchema.safeParse(value);

  if (parsed.success) {
    return { valid: true, pack: parsed.data };
  }

  return {
    valid: false,
    error: parsed.error.issues[0]?.message ?? "Invalid preset pack."
  };
}
