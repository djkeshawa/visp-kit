import { describe, expect, it } from "vitest";

import { slugifyFeatureTitle } from "../../../src/features/slugify.js";

describe("slugifyFeatureTitle", () => {
  it("creates readable lowercase slugs", () => {
    expect(slugifyFeatureTitle("Add note pinning")).toBe("add-note-pinning");
  });

  it("converts punctuation to hyphens", () => {
    expect(slugifyFeatureTitle("Export Notes as PDF!")).toBe("export-notes-as-pdf");
    expect(slugifyFeatureTitle("Improve AI/LLM settings")).toBe("improve-ai-llm-settings");
  });

  it("collapses whitespace and repeated hyphens", () => {
    expect(slugifyFeatureTitle("  Add   Local Sync  ")).toBe("add-local-sync");
    expect(slugifyFeatureTitle("Add---Local___Sync")).toBe("add-local-sync");
  });

  it("returns an empty slug when no supported characters remain", () => {
    expect(slugifyFeatureTitle("!!!")).toBe("");
  });

  it("limits slug length without trailing hyphens", () => {
    expect(slugifyFeatureTitle("Add a very long feature title", 10)).toBe("add-a-very");
  });
});
