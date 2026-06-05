import { describe, expect, it } from "vitest";

import { eventId, nextRunId } from "../../../src/runs/run-id.js";

describe("run ids", () => {
  it("starts at RUN001 and skips invalid ids", () => {
    expect(nextRunId([])).toBe("RUN001");
    expect(nextRunId(["RUN001", "bad", "RUN009"])).toBe("RUN010");
  });

  it("formats event ids", () => {
    expect(eventId(0)).toBe("EVT001");
    expect(eventId(12)).toBe("EVT013");
  });
});
