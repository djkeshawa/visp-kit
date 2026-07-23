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
    expect(markdown).toContain("## Artifact Provenance");
    expect(markdown).toContain(
      "spec: .visp/features/001-note-pinning/spec.json (sha256:0123456789ab)"
    );
  });

  it("renders task class, risk level, and risk factors as separate facts", () => {
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
      pack: {
        ...validContextPack,
        selectedTask: {
          ...validContextPack.selectedTask,
          taskClass: "bounded_feature",
          riskLevel: "medium",
          riskFactors: [
            { version: "1.0", code: "public_api" },
            { version: "1.0", code: "schema" }
          ]
        }
      }
    });

    expect(markdown).toContain("- Task class: bounded_feature");
    expect(markdown).toContain("- Risk level: medium");
    expect(markdown).toContain("- Risk factors: public_api, schema");
    expect(markdown).not.toContain("- Risk: medium");
  });

  it("distinguishes explicitly empty factors from unknown legacy classification", () => {
    const baseInput = {
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
      }
    };
    const explicitEmpty = renderContextMarkdown({
      ...baseInput,
      pack: {
        ...validContextPack,
        selectedTask: {
          ...validContextPack.selectedTask,
          taskClass: "documentation",
          riskFactors: []
        }
      }
    });
    const legacyUnknown = renderContextMarkdown({
      ...baseInput,
      pack: validContextPack
    });

    expect(explicitEmpty).toContain("- Task class: documentation");
    expect(explicitEmpty).toContain("- Risk factors: none");
    expect(legacyUnknown).toContain("- Task class: unknown");
    expect(legacyUnknown).toContain("- Risk factors: unknown");
  });
});
