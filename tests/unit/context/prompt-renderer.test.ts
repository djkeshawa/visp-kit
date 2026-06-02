import { describe, expect, it } from "vitest";

import { renderTaskPrompt } from "../../../src/context/prompt-renderer.js";
import { validContextPack } from "../artifacts/fixtures.js";

describe("prompt renderer", () => {
  it("references context path and selected task", () => {
    const prompt = renderTaskPrompt({
      contextPath: ".visp/features/001-note-pinning/context/T001.context.md",
      pack: validContextPack
    });

    expect(prompt).toContain("T001 - Add note sorting helper");
    expect(prompt).toContain(".visp/features/001-note-pinning/context/T001.context.md");
    expect(prompt).toContain("Implement only T001");
  });
});
