import { describe, expect, it } from "vitest";

import { presetSchema } from "../../../src/artifacts/schemas/common.schema.js";
import { presetPackSchema } from "../../../src/artifacts/schemas/preset.schema.js";
import { builtinPresetPack } from "../../../src/presets/builtin-packs.js";

describe("built-in preset packs", () => {
  it("validates every supported preset pack", () => {
    for (const preset of presetSchema.options) {
      const pack = builtinPresetPack(preset);

      expect(presetPackSchema.safeParse(pack).success).toBe(true);
      expect(pack.name).toBe(preset);
      expect(pack.validationCommandHints.length).toBeGreaterThan(0);
    }
  });

  it("includes core language dependency manifests", () => {
    expect(builtinPresetPack("go").dependencyFiles).toContain("go.mod");
    expect(builtinPresetPack("java").dependencyFiles).toContain("pom.xml");
    expect(builtinPresetPack("python").dependencyFiles).toContain("pyproject.toml");
    expect(builtinPresetPack("rust").dependencyFiles).toContain("Cargo.toml");
  });
});
