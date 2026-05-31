import { describe, expect, it } from "vitest";

import { buildConstitutionRules } from "../../../src/constitution/constitution-rules.js";
import {
  renderCompactConstitution,
  renderFullConstitution
} from "../../../src/constitution/render-constitution.js";

describe("constitution rendering", () => {
  it("renders compact rules as C### lines", () => {
    const compact = renderCompactConstitution(
      buildConstitutionRules("generic", "lean")
    );

    expect(compact.split("\n")[0]).toBe(
      "C001: Keep functions small, specific, and readable."
    );
    expect(compact).not.toContain("#");
  });

  it("renders full constitution with preset and budget guidance", () => {
    const full = renderFullConstitution({
      generatedAt: "2026-01-01T00:00:00.000Z",
      preset: "react",
      budget: "strict",
      rules: buildConstitutionRules("react", "strict"),
      project: {
        name: "ui-app",
        rootPath: "/tmp/ui-app",
        packageManager: "pnpm",
        languages: ["TypeScript"],
        frameworks: ["react"],
        testFrameworks: ["vitest"],
        buildCommands: ["pnpm build"],
        testCommands: ["pnpm test"],
        lintCommands: [],
        typecheckCommands: ["pnpm typecheck"],
        sourceRoots: ["src"],
        testRoots: ["tests"],
        ignoredPaths: [".visp"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z"
      }
    });

    expect(full).toContain("# ui-app Constitution");
    expect(full).toContain("Preset: react");
    expect(full).toContain("Budget mode: strict");
    expect(full).toContain("accessibility");
    expect(full).toContain("stronger validation");
  });
});
