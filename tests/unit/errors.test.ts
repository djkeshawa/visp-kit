import { describe, expect, it } from "vitest";

import { VispError, formatVispError, toVispError } from "../../src/core/errors.js";

describe("VispError", () => {
  it("formats errors without recovery", () => {
    const error = new VispError("VALIDATION_FAILED", "Something is missing.");

    expect(formatVispError(error)).toBe("[VALIDATION_FAILED] Something is missing.");
    expect(error.recovery).toBeUndefined();
  });

  it("formats errors with a recovery command", () => {
    const error = new VispError("VALIDATION_FAILED", "Spec is missing.", {
      recovery: "visp spec"
    });

    expect(formatVispError(error)).toBe(
      "[VALIDATION_FAILED] Spec is missing.\nRecover: run `visp spec`"
    );
    expect(error.recovery).toBe("visp spec");
  });

  it("preserves VispError instances through toVispError", () => {
    const error = new VispError("VALIDATION_FAILED", "Original.", { recovery: "visp init" });

    expect(toVispError(error)).toBe(error);
    expect(toVispError(error).recovery).toBe("visp init");
  });
});
