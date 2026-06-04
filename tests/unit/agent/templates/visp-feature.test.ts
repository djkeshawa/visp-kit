import { describe, expect, it } from "vitest";

import { renderVispFeatureTemplate } from "../../../../src/agent/templates/visp-feature.js";

describe("visp-feature template", () => {
  it("enforces strict one-task feature workflow", () => {
    const content = renderVispFeatureTemplate("strict");

    expect(content).toContain("The user prompt is raw intent only");
    expect(content).toContain("visp gate next");
    expect(content).toContain("visp context --next");
    expect(content).toContain("visp gate implement --task <task-id>");
    expect(content).toContain("Implement only one selected task at a time");
    expect(content).toContain("visp verify --task <task-id>");
    expect(content).toContain("visp review --task <task-id>");
    expect(content).toContain("visp reconcile --task <task-id> --update-traceability");
  });
});
