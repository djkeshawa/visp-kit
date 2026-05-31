import { describe, expect, it } from "vitest";

import {
  formatError,
  formatHeader,
  formatKeyValue,
  formatMuted,
  formatStatus,
  formatSuccess,
  formatWarning
} from "../../src/theme/terminal.js";

describe("terminal formatting helpers", () => {
  const noColor = { color: false };

  it("formats the Visp header with a minimal flow mark", () => {
    expect(formatHeader("Visp Kit", noColor)).toBe("∞ Visp Kit");
  });

  it("formats key value lines", () => {
    expect(formatKeyValue("State", "PLAN_READY", noColor)).toBe(
      "State: PLAN_READY"
    );
  });

  it("formats normalized status labels", () => {
    expect(formatStatus("Needs Clarification", noColor)).toBe(
      "[needs-clarification]"
    );
  });

  it("formats calm severity lines", () => {
    expect(formatSuccess("Ready", noColor)).toBe("[ready] Ready");
    expect(formatWarning("Clarify scope", noColor)).toBe(
      "[needs-clarification] Clarify scope"
    );
    expect(formatError("Command failed", noColor)).toBe(
      "[error] Command failed"
    );
    expect(formatMuted("quiet detail", noColor)).toBe("quiet detail");
  });
});
