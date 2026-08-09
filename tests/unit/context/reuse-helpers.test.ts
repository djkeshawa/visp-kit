import { describe, expect, it } from "vitest";

import { findReuseHelpers, renderReuseHelpers } from "../../../src/context/reuse-helpers.js";

// The exact scan entry from the phase-18 codebase, verbatim from
// .visp/cache/file-summaries.json. Both agents in that measurement built a
// new error surface printing raw error strings while these symbols sat
// unread in the cache.
const secretsFile = {
  path: "src/utils/secrets.rs",
  symbols: [
    "credential_regex",
    "get_uri_from_env_or_provided",
    "mask_error_message",
    "mask_uri",
    "sanitize_file_path",
    "test_mask_uri_with_password",
    "test_mask_error_message"
  ]
};

describe("scan knowledge reaches whoever writes the code", () => {
  it("surfaces the redaction helpers the phase-18 agents both missed", () => {
    const helpers = findReuseHelpers([secretsFile]);

    expect(helpers).toHaveLength(1);
    expect(helpers[0]?.path).toBe("src/utils/secrets.rs");
    expect(helpers[0]?.concern).toContain("redacting secrets");
    expect(helpers[0]?.symbols).toContain("mask_error_message");
    expect(helpers[0]?.symbols).toContain("mask_uri");
  });

  it("leaves test symbols out — they describe the helper, they are not it", () => {
    const helpers = findReuseHelpers([secretsFile]);

    expect(helpers[0]?.symbols.join(" ")).not.toContain("test_mask");
  });

  it("ignores files that only hold tests", () => {
    expect(
      findReuseHelpers([{ path: "tests/secrets_test.rs", symbols: ["mask_uri"] }])
    ).toEqual([]);
  });

  it("puts output safety first, because a truncated pack must keep that line", () => {
    const helpers = findReuseHelpers([
      { path: "src/retry.rs", symbols: ["retry_with_backoff"] },
      secretsFile
    ]);

    expect(helpers[0]?.concern).toContain("redacting secrets");
  });

  it("finds resume and retry helpers too", () => {
    const helpers = findReuseHelpers([
      { path: "src/export/resumable.rs", symbols: ["load_session", "find_resumable_exports"] }
    ]);

    expect(helpers[0]?.concern).toContain("resuming");
  });

  it("says nothing when a project has no such helpers", () => {
    expect(findReuseHelpers([{ path: "src/main.rs", symbols: ["main", "run"] }])).toEqual([]);
    expect(renderReuseHelpers([])).toBe("");
  });

  it("renders one actionable line per helper", () => {
    expect(renderReuseHelpers(findReuseHelpers([secretsFile]))).toBe(
      "- src/utils/secrets.rs — redacting secrets from output: mask_error_message, mask_uri, sanitize_file_path"
    );
  });
});
