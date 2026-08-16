import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runCommand } from "../../../src/core/command-runner.js";
import {
  signDecisionHash,
  verifyDecisionSignature
} from "../../../src/review/review-decision-signature.js";

const decisionHash = `sha256:${"a".repeat(64)}`;

describe("review decision signature", () => {
  let dir: string;
  let keyPath: string;
  let otherKeyPath: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "visp-signature-test-"));
    keyPath = path.join(dir, "id_reviewer");
    otherKeyPath = path.join(dir, "id_other");
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
    ]);
    await runCommand("ssh-keygen", [
      "-t",
      "ed25519",
      "-N",
      "",
      "-C",
      "other",
      "-f",
      otherKeyPath,
      "-q"
    ]);
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("signs a decision hash and verifies it back to the signing key", async () => {
    const signed = await signDecisionHash({
      decisionHash,
      keyPath,
      signedAt: "2026-07-26T00:00:00.000Z"
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;

    expect(signed.value.scheme).toBe("ssh");
    expect(signed.value.keyFingerprint).toMatch(/^SHA256:[A-Za-z0-9+/]{43}$/u);
    expect(signed.value.value).toContain("BEGIN SSH SIGNATURE");

    const verified = await verifyDecisionSignature({
      decisionHash,
      signature: signed.value
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(verified.value.verified).toBe(true);
    expect(verified.value.keyFingerprint).toBe(signed.value.keyFingerprint);
  });

  it("rejects a signature over a different decision hash", async () => {
    const signed = await signDecisionHash({
      decisionHash,
      keyPath,
      signedAt: "2026-07-26T00:00:00.000Z"
    });
    if (!signed.ok) throw new Error("signing failed");

    // This is the attack the signature exists to stop: reusing a genuine
    // signature on a decision whose content was swapped.
    const verified = await verifyDecisionSignature({
      decisionHash: `sha256:${"b".repeat(64)}`,
      signature: signed.value
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.verified).toBe(false);
  });

  it("rejects a signature whose recorded fingerprint was rewritten", async () => {
    const signed = await signDecisionHash({
      decisionHash,
      keyPath,
      signedAt: "2026-07-26T00:00:00.000Z"
    });
    const other = await signDecisionHash({
      decisionHash,
      keyPath: otherKeyPath,
      signedAt: "2026-07-26T00:00:00.000Z"
    });
    if (!signed.ok || !other.ok) throw new Error("signing failed");

    const verified = await verifyDecisionSignature({
      decisionHash,
      signature: { ...signed.value, keyFingerprint: other.value.keyFingerprint }
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.verified).toBe(false);
    expect(verified.value.reason).toContain("not the recorded");
  });

  it("rejects a signature made for a different namespace", async () => {
    const payloadPath = path.join(dir, "foreign-payload");
    await writeFile(payloadPath, decisionHash, "utf8");
    await runCommand("ssh-keygen", [
      "-Y",
      "sign",
      "-f",
      keyPath,
      "-n",
      "some.other.namespace",
      payloadPath
    ]);
    const foreign = await readFile(`${payloadPath}.sig`, "utf8");

    const verified = await verifyDecisionSignature({
      decisionHash,
      signature: {
        scheme: "ssh",
        keyFingerprint: `SHA256:${"A".repeat(43)}`,
        value: foreign,
        signedAt: "2026-07-26T00:00:00.000Z"
      }
    });

    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.value.verified).toBe(false);
  });
});
