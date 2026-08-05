// F11 — a missing upstream artifact is a hard failure, in every stage.
//
// Kit emits two failure shapes, and a coordinator has to tell them apart:
//
//   soft  { success:false, validation:{ passed:false, errors:[…] } }
//         the human's JSON is on disk and still needs filling in
//   hard  { success:false, error, recovery }
//         the wrong stage was run — the upstream artifact does not exist
//
// spec, plan and tasks all report a missing prerequisite as HARD. clarify
// alone reported it as SOFT, which makes the two indistinguishable: a
// coordinator branching on the envelope would tell the user to go fill in a
// clarifications file that has not been generated yet, when what they actually
// need is to register a feature.

import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runClarifyWorkflow } from "../../../src/workflows/clarify.workflow.js";
import { runFeatureWorkflow } from "../../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../../src/workflows/init.workflow.js";
import { expectOk } from "../../integration/phase8-fixture.js";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-clarify-prereq-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("clarify reports a missing prerequisite the way its siblings do", () => {
  it("fails hard, with a recovery command, when the feature intent is absent", async () => {
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "add a login page",
        noBranch: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );
    // Remove the intent markdown only. Deleting intent.json instead makes
    // `resolveActiveFeature` fail first with FILE_NOT_FOUND, which never
    // reaches the prerequisite branch under test — the feature must still
    // resolve for this to be the code path a user actually hits.
    const { readdir } = await import("node:fs/promises");
    const [key] = await readdir(path.join(tempDir, ".visp", "features"));
    await rm(path.join(tempDir, ".visp", "features", key ?? "", "intent.md"), { force: true });

    const result = await runClarifyWorkflow({ targetPath: tempDir });

    expect(
      result.ok,
      "clarify reported a missing upstream artifact as a soft validation failure. " +
        "A caller cannot then distinguish 'your JSON needs filling in' from 'you are at " +
        "the wrong stage', which are opposite instructions."
    ).toBe(false);
    if (!result.ok) {
      expect(result.error.recovery).toBeDefined();
      expect(result.error.recovery).toContain("visp-kit feature");
    }
  });

  it("still succeeds when the prerequisite is present", async () => {
    // The converse: failing hard on everything would satisfy the test above.
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "add a login page",
        noBranch: true,
        now: "2026-01-01T00:00:00.000Z"
      })
    );

    const result = await runClarifyWorkflow({ targetPath: tempDir });

    expect(result.ok, "clarify refused a feature whose intent artifacts exist").toBe(true);
  });
});
