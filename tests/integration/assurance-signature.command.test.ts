import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";
import { runCommand } from "../../src/core/command-runner.js";
import { evaluatePolicyGate } from "../../src/gates/policy-gate-summary.js";
import {
  evaluateCurrentReviewDecision,
  runReviewDecisionWorkflow
} from "../../src/review/review-decision.js";
import { runAssuranceWorkflow } from "../../src/workflows/assurance.workflow.js";
import { createPhase8Fixture, expectOk, removeTempDirWithRetry } from "./phase8-fixture.js";

const assuranceDirFor = (root: string): string =>
  path.join(root, ".visp", "features", "001-add-note-pinning", "assurance", "T001");

describe("signed assurance decisions", () => {
  let targetPath: string;
  let keyDir: string;
  let keyPath: string;
  let mandatoryHotspots: string[];

  beforeAll(async () => {
    keyDir = await mkdtemp(path.join(os.tmpdir(), "visp-signkey-"));
    keyPath = path.join(keyDir, "id_reviewer");
    expectOk(
      await runCommand("ssh-keygen", [
        "-t",
        "ed25519",
        "-N",
        "",
        "-C",
        "reviewer",
        "-f",
        keyPath,
        "-q"
      ])
    );

    targetPath = await mkdtemp(path.join(os.tmpdir(), "visp-signed-assurance-"));
    await createPhase8Fixture(targetPath);

    // Policy must reach its final state before the oracle plan and assurance
    // case bind its hash; editing it afterwards correctly invalidates them.
    const policyPath = path.join(targetPath, ".visp", "policy.json");
    const policy = JSON.parse(await readFile(policyPath, "utf8"));
    policy.rules.requireCurrentAssuranceDecisionBeforePr = true;
    policy.rules.requireSignedAssuranceDecision = true;
    await writeFile(policyPath, `${JSON.stringify(policy, null, 2)}\n`, "utf8");

    expectOk(await runCommand("git", ["init"], { cwd: targetPath }));
    expectOk(await runCommand("git", ["add", "."], { cwd: targetPath }));
    expectOk(
      await runCommand(
        "git",
        ["-c", "user.name=T", "-c", "user.email=t@t.invalid", "commit", "-m", "fixture"],
        { cwd: targetPath }
      )
    );
    const program = createCli({ writeOut: () => undefined });
    await program.parseAsync(["node", "visp", "context", "T001", targetPath, "--force"]);
    await program.parseAsync(["node", "visp", "oracle", "plan", targetPath, "--task", "T001"]);
    await program.parseAsync(["node", "visp", "oracle", "lock", targetPath, "--task", "T001"]);
    await writeFile(
      path.join(targetPath, "src", "notes.ts"),
      `${await readFile(path.join(targetPath, "src", "notes.ts"), "utf8")}\nexport const assured = true;\n`,
      "utf8"
    );
    process.exitCode = undefined;

    expectOk(
      await runAssuranceWorkflow({ targetPath, taskId: "T001", now: "2026-07-26T01:00:00.000Z" })
    );
    const assuranceCase = JSON.parse(
      await readFile(path.join(assuranceDirFor(targetPath), "assurance-case.json"), "utf8")
    );
    mandatoryHotspots = assuranceCase.hotspots
      .filter((hotspot: { mandatory: boolean }) => hotspot.mandatory)
      .map((hotspot: { id: string }) => hotspot.id);
  }, 300_000);

  afterAll(async () => {
    await removeTempDirWithRetry(targetPath);
    await rm(keyDir, { recursive: true, force: true });
  });

  it("records a signed decision and verifies it end to end", async () => {
    const signed = await runReviewDecisionWorkflow({
      targetPath,
      taskId: "T001",
      reviewerId: "reviewer",
      reason: "Reviewed every mandatory hotspot and accept the residual risk.",
      decision: "accept",
      reviewedHotspotIds: mandatoryHotspots,
      signKeyPath: keyPath
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    const history = await readdir(path.join(assuranceDirFor(targetPath), "review-decisions"));
    const stored = JSON.parse(
      await readFile(
        path.join(assuranceDirFor(targetPath), "review-decisions", history[0]!),
        "utf8"
      )
    );

    expect(stored.identityAssurance).toBe("ssh_signed");
    expect(stored.signature.scheme).toBe("ssh");
    expect(stored.signature.keyFingerprint).toMatch(/^SHA256:/u);
    // The signature must live outside the hashed body so the content-addressed
    // history filename stays derived from decisionHash alone.
    expect(history[0]).toBe(`${stored.decisionHash.replace("sha256:", "")}.json`);

    const currentness = await evaluateCurrentReviewDecision({ targetPath, taskId: "T001" });
    expect(currentness.ok).toBe(true);
    if (!currentness.ok) return;
    expect(currentness.value.status).toBe("current");
  }, 300_000);

  it("rejects the decision once its signature is tampered with", async () => {
    const historyDir = path.join(assuranceDirFor(targetPath), "review-decisions");
    const [name] = await readdir(historyDir);
    const file = path.join(historyDir, name!);
    const original = await readFile(file, "utf8");
    const doc = JSON.parse(original);

    // Swap in a structurally valid signature from a different payload.
    const otherPayload = path.join(keyDir, "other");
    await writeFile(otherPayload, "sha256:not-the-decision", "utf8");
    expectOk(
      await runCommand("ssh-keygen", [
        "-Y",
        "sign",
        "-f",
        keyPath,
        "-n",
        "visp.review-decision",
        otherPayload
      ])
    );
    doc.signature.value = await readFile(`${otherPayload}.sig`, "utf8");
    await writeFile(file, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

    const currentness = await evaluateCurrentReviewDecision({ targetPath, taskId: "T001" });
    expect(currentness.ok).toBe(true);
    if (!currentness.ok) return;
    expect(currentness.value.status).toBe("invalid");
    expect(currentness.value.reason).toContain("signature");

    await writeFile(file, original, "utf8");
  }, 300_000);

  it("blocks the PR gate under VSP025 when the reviewer is only self-declared", async () => {
    // The signed decision still satisfies VSP025.
    const signedGate = expectOk(
      await evaluatePolicyGate({
        targetPath,
        stage: "pr",
        taskId: "T001",
        now: "2026-07-26T02:00:00.000Z"
      })
    );
    expect(signedGate.failedRules.some((rule) => rule.ruleId === "VSP025")).toBe(false);

    // Re-record the same decision without a key: a typed name is no longer enough.
    expectOk(
      await runReviewDecisionWorkflow({
        targetPath,
        taskId: "T001",
        reviewerId: "reviewer",
        reason: "Re-recording the acceptance without any cryptographic binding.",
        decision: "accept",
        reviewedHotspotIds: mandatoryHotspots
      })
    );

    const unsignedGate = expectOk(
      await evaluatePolicyGate({
        targetPath,
        stage: "pr",
        taskId: "T001",
        now: "2026-07-26T03:00:00.000Z"
      })
    );
    expect(unsignedGate.failedRules.some((rule) => rule.ruleId === "VSP025")).toBe(true);
    expect(unsignedGate.allowed).toBe(false);
  }, 300_000);
});
