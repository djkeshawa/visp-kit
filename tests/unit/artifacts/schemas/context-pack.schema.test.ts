import { describe, expect, it } from "vitest";

import { contextPackSchema } from "../../../../src/artifacts/schemas/context-pack.schema.js";
import { validContextPack } from "../fixtures.js";

describe("context pack schema", () => {
  it("accepts valid context packs", () => {
    expect(contextPackSchema.safeParse(validContextPack).success).toBe(true);
  });

  it("rejects invalid include modes", () => {
    const result = contextPackSchema.safeParse({
      ...validContextPack,
      includedFiles: [
        {
          ...validContextPack.includedFiles[0],
          includeMode: "partial"
        }
      ]
    });

    expect(result.success).toBe(false);
  });

  it("rejects snippets with inverted line ranges", () => {
    const result = contextPackSchema.safeParse({
      ...validContextPack,
      includedSnippets: [
        {
          ...validContextPack.includedSnippets[0],
          startLine: 12,
          endLine: 1
        }
      ]
    });

    expect(result.success).toBe(false);
  });
});
