import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runFeatureWorkflow } from "../../src/workflows/feature.workflow.js";
import { runInitWorkflow } from "../../src/workflows/init.workflow.js";

function expectOk<T>(result: { ok: true; value: T } | { ok: false }): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Expected result to be ok.");
  return result.value;
}

const FEATURE_DIR = path.join(".visp", "features", "001-add-note-pinning");

/**
 * Ten of the head-to-head run's fourteen invocations failed, and most of the
 * failures were the tool's own. Clarify, spec, plan and tasks each emitted a
 * template full of the literal "TBD" and then failed validation FOR containing
 * "TBD" — a document that could not pass its own validator — while one error
 * read `"TBD" is declared both a business rule and out of scope`, advice about
 * a word the author never wrote.
 *
 * Nothing about the seeding was wrong. Reporting it as a failure was.
 */
describe("template commands seed drafts instead of failing", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "visp-template-draft-"));
    process.exitCode = undefined;
    expectOk(await runInitWorkflow({ targetPath: tempDir, agent: "none" }));
    expectOk(
      await runFeatureWorkflow({
        targetPath: tempDir,
        featureIdea: "Add note pinning",
        now: "2026-01-01T00:00:00.000Z"
      })
    );
  });

  afterEach(async () => {
    process.exitCode = undefined;
    await rm(tempDir, { recursive: true, force: true });
  });

  it("exits zero and calls the seeded clarify artifact a draft", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    expect(process.exitCode).toBeUndefined();
    expect(output.join("")).toContain("draft written");
    expect(output.join("")).toContain("Still to fill in:");
    // The draft must never read as accepted. The next stage refuses it, and
    // the output has to say so or the reader will run that stage next.
    expect(output.join("")).toContain("will refuse it until the fields above are filled in");
  });

  it("reports the draft as a draft in JSON, without claiming validation passed", async () => {
    const output: string[] = [];
    const program = createCli({ writeOut: (value) => output.push(value) });

    await program.parseAsync(["node", "visp", "clarify", tempDir, "--json"]);

    const summary = JSON.parse(output.join("")) as {
      success: boolean;
      outcome: string;
      validation: { passed: boolean; errors: string[] };
    };

    expect(summary.outcome).toBe("draft");
    expect(summary.success).toBe(true);
    // The honest half: the artifact is NOT valid, and the summary still says
    // so. Only the verdict on the invocation changed.
    expect(summary.validation.passed).toBe(false);
    expect(summary.validation.errors.length).toBeGreaterThan(0);
  });

  it("does not advance the workflow state on a draft", async () => {
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    const status = await readFile(path.join(tempDir, ".visp", "status.json"), "utf8");

    expect(status).not.toContain("clarification_ready");
  });

  it("still fails --validate on an unfilled draft", async () => {
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);
    process.exitCode = undefined;
    await program.parseAsync(["node", "visp", "clarify", tempDir, "--validate"]);

    // `--validate` judges what the author wrote. An unfilled draft fails it,
    // exactly as before. Nothing here relaxes that.
    expect(process.exitCode).toBe(1);
  });

  it("keeps the clarify question and the spec intact", async () => {
    const program = createCli({ writeOut: () => undefined });

    await program.parseAsync(["node", "visp", "clarify", tempDir]);

    const clarifications = await readFile(
      path.join(tempDir, FEATURE_DIR, "clarifications.json"),
      "utf8"
    );

    // These two were the parts of the run that genuinely helped: the security
    // question clarify asks by default, and the spec that let a reviewer prove
    // the delivered game was broken. Neither is weakened by any of the above.
    expect(clarifications).toContain(
      "What must never appear in this feature's output, logs, or error messages?"
    );
    expect(clarifications).toContain("accepted_default");
  });
});
