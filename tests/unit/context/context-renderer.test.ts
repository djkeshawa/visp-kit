import { describe, expect, it } from "vitest";

import { renderContextMarkdown } from "../../../src/context/context-renderer.js";
import { validContextPack, validFeature } from "../artifacts/fixtures.js";

describe("context renderer", () => {
  it("renders task, requirements, snippets, and budget", () => {
    const markdown = renderContextMarkdown({
      feature: {
        id: "001",
        slug: "note-pinning",
        key: "001-note-pinning",
        path: "/workspace/.visp/features/001-note-pinning",
        relativePath: ".visp/features/001-note-pinning",
        intent: {
          ...validFeature,
          rawUserRequest: "Add note pinning"
        }
      },
      pack: validContextPack
    });

    expect(markdown).toContain("# Context Pack: T001");
    expect(markdown).toContain("REQ-001");
    expect(markdown).toContain("Snippet");
    expect(markdown).toContain("Estimated input tokens");
    expect(markdown).toContain("Implementation Checklist");
    expect(markdown).toContain("visp checklist status --task T001");
  });
});
