import { describe, expect, it } from "vitest";

import { captureOutput } from "../../../src/verification/output-capture.js";

describe("output capture", () => {
  it("keeps short output intact", () => {
    expect(captureOutput("hello", 10)).toEqual({
      value: "hello",
      truncated: false
    });
  });

  it("keeps the tail of long output", () => {
    expect(captureOutput("abcdefghijkl", 4)).toEqual({
      value: "ijkl",
      truncated: true
    });
  });
});
