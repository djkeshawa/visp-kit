import { describe, expect, it } from "vitest";

import { testStrengthChangedMessage } from "../../../src/oracle/test-strength-recovery.js";

const evidence = {
  path: "tests/notes.test.ts",
  sha256: `sha256:${"a".repeat(64)}` as const,
  independence: "pre_existing" as const,
  source: { kind: "git_base_commit" as const, commit: "b".repeat(40) }
};

describe("testStrengthChangedMessage", () => {
  it("offers restoring the file when the edit was accidental", () => {
    const message = testStrengthChangedMessage({ evidence, taskId: "T009" });

    expect(message).toContain("git checkout -- tests/notes.test.ts");
  });

  it("says that --pre-approved-test re-pins rather than exempts", () => {
    // LC-121: the old message recommended this flag for a task whose deliverable
    // is the test, where it cannot work — `pre_approved` is hash-pinned at plan
    // time exactly like `pre_existing`, so the next edit fails identically.
    const message = testStrengthChangedMessage({ evidence, taskId: "T009" });

    expect(message).toContain("--pre-approved-test tests/notes.test.ts --force");
    expect(message).toContain("it does not exempt it");
  });

  it("names the only route for a task whose deliverable is the test", () => {
    const message = testStrengthChangedMessage({ evidence, taskId: "T009" });

    expect(message).toContain('taskClass: "regression_test"');
    expect(message).toContain("`expectedFiles`");
    expect(message).toContain("no flag can allow that");
  });
});
