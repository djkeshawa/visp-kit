import { describe, expect, it } from "vitest";

import { renderReconcilePrompt } from "../../../src/reconcile/reconcile-prompt.js";
import { validReconcileReport } from "../artifacts/fixtures.js";

describe("reconcile prompt renderer", () => {
  it("references report and context paths", () => {
    const prompt = renderReconcilePrompt({
      report: validReconcileReport,
      taskTitle: "Add note sorting helper",
      paths: [
        ".visp/features/001-note-pinning/context/T001.context.md",
        ".visp/features/001-note-pinning/reconcile/T001.reconcile.md"
      ]
    });

    expect(prompt).toContain("T001 - Add note sorting helper");
    expect(prompt).toContain(".visp/features/001-note-pinning/reconcile/T001.reconcile.md");
  });
});
