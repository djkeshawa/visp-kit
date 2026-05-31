import { describe, expect, it } from "vitest";

import {
  createArtifactValidationError,
  formatValidationError
} from "../../../src/artifacts/validation-error.js";
import { projectProfileSchema } from "../../../src/artifacts/schemas/project.schema.js";

describe("validation error formatting", () => {
  it("formats zod issues with artifact names and paths", () => {
    const result = projectProfileSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);

    if (!result.success) {
      const message = formatValidationError(result.error, "project profile");

      expect(message).toContain("Invalid project profile");
      expect(message).toContain("name");
      expect(message).toContain("rootPath");
    }
  });

  it("wraps validation failures as Visp errors", () => {
    const result = projectProfileSchema.safeParse({ name: "" });

    expect(result.success).toBe(false);

    if (!result.success) {
      const error = createArtifactValidationError(
        result.error,
        "project profile",
        ".visp/project.json"
      );

      expect(error.code).toBe("VALIDATION_FAILED");
      expect(error.details).toMatchObject({
        artifactName: "project profile",
        artifactPath: ".visp/project.json"
      });
    }
  });
});
