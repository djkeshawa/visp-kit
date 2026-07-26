import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { type ReviewDecisionSignature } from "../artifacts/schemas/review-decision.schema.js";
import { defaultCommandRunner, type CommandRunner } from "../core/command-runner.js";
import { VispError, toVispError } from "../core/errors.js";
import { err, ok, type Result } from "../core/result.js";

/**
 * Namespace passed to `ssh-keygen -Y`. It binds a signature to this use, so a
 * signature harvested from some other Visp or SSH context cannot be replayed
 * as a review decision.
 */
export const reviewDecisionSignatureNamespace = "visp.review-decision";

const fingerprintPattern = /\bSHA256:[A-Za-z0-9+/]{43}\b/u;

async function withTempDir<T>(
  run: (dir: string) => Promise<Result<T, VispError>>
): Promise<Result<T, VispError>> {
  let dir: string | undefined;

  try {
    dir = await mkdtemp(path.join(os.tmpdir(), "visp-signature-"));
    return await run(dir);
  } catch (error) {
    return err(toVispError(error, "FILE_SYSTEM_ERROR"));
  } finally {
    if (dir !== undefined) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * Sign a decision hash with an SSH private key.
 *
 * The signed payload is the `decisionHash` string itself, which already commits
 * to the whole canonical decision body.
 */
export async function signDecisionHash(input: {
  readonly decisionHash: string;
  readonly keyPath: string;
  readonly signedAt: string;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<ReviewDecisionSignature, VispError>> {
  const runner = input.commandRunner ?? defaultCommandRunner;

  return withTempDir<ReviewDecisionSignature>(async (dir) => {
    const payloadPath = path.join(dir, "payload");
    await writeFile(payloadPath, input.decisionHash, "utf8");

    const signed = await runner.run(
      "ssh-keygen",
      ["-Y", "sign", "-f", input.keyPath, "-n", reviewDecisionSignatureNamespace, payloadPath],
      { cwd: dir }
    );

    if (!signed.ok) {
      return err(
        new VispError(
          "COMMAND_FAILED",
          `Unable to sign the review decision with ${input.keyPath}. ${signed.error.message}`,
          { recovery: "Check the key path and that ssh-keygen is installed." }
        )
      );
    }

    const value = await readFile(`${payloadPath}.sig`, "utf8");
    const fingerprint = await readKeyFingerprint({ keyPath: input.keyPath, runner });

    if (!fingerprint.ok) return fingerprint;

    return ok({
      scheme: "ssh" as const,
      keyFingerprint: fingerprint.value,
      value,
      signedAt: input.signedAt
    });
  });
}

async function readKeyFingerprint(input: {
  readonly keyPath: string;
  readonly runner: CommandRunner;
}): Promise<Result<string, VispError>> {
  const result = await input.runner.run("ssh-keygen", ["-lf", input.keyPath]);

  if (!result.ok) {
    return err(
      new VispError("COMMAND_FAILED", `Unable to read the fingerprint of ${input.keyPath}.`)
    );
  }

  const fingerprint = fingerprintPattern.exec(result.value.stdout)?.[0];

  return fingerprint === undefined
    ? err(
        new VispError(
          "VALIDATION_FAILED",
          `ssh-keygen did not report a SHA256 fingerprint for ${input.keyPath}.`
        )
      )
    : ok(fingerprint);
}

export type SignatureVerification = {
  readonly verified: boolean;
  readonly keyFingerprint: string | null;
  readonly reason: string;
};

/**
 * Verify that `signature` is an intact SSH signature over `decisionHash`, and
 * report which key produced it.
 *
 * Uses `check-novalidate` rather than a full `-Y verify` on purpose. Kit's
 * question is "is this binding intact, and by which key?" — not "is that key
 * allowed to approve?", which needs a principal and an allowed-signers roster
 * and belongs to the Control Plane. See ADR 0003.
 */
export async function verifyDecisionSignature(input: {
  readonly decisionHash: string;
  readonly signature: ReviewDecisionSignature;
  readonly commandRunner?: CommandRunner;
}): Promise<Result<SignatureVerification, VispError>> {
  const runner = input.commandRunner ?? defaultCommandRunner;

  return withTempDir<SignatureVerification>(async (dir) => {
    const payloadPath = path.join(dir, "payload");
    const signaturePath = path.join(dir, "payload.sig");
    await writeFile(payloadPath, input.decisionHash, "utf8");
    await writeFile(signaturePath, input.signature.value, "utf8");

    // `check-novalidate` reads the signed payload from stdin.
    const checked = await runner.run(
      "ssh-keygen",
      ["-Y", "check-novalidate", "-n", reviewDecisionSignatureNamespace, "-s", signaturePath],
      { cwd: dir, stdin: input.decisionHash }
    );

    if (!checked.ok) {
      return ok({
        verified: false,
        keyFingerprint: null,
        reason: "The recorded signature does not verify against the decision hash."
      });
    }

    const output = `${checked.value.stdout}${checked.value.stderr}`;
    const fingerprint = fingerprintPattern.exec(output)?.[0] ?? null;

    if (fingerprint === null) {
      return ok({
        verified: false,
        keyFingerprint: null,
        reason: "ssh-keygen accepted the signature but reported no key fingerprint."
      });
    }

    // A signature that verifies under a different key than the one recorded
    // means the artifact was rewritten; the binding is intact but not to the
    // key the decision claims.
    if (fingerprint !== input.signature.keyFingerprint) {
      return ok({
        verified: false,
        keyFingerprint: fingerprint,
        reason: `The signature verifies under ${fingerprint}, not the recorded ${input.signature.keyFingerprint}.`
      });
    }

    return ok({
      verified: true,
      keyFingerprint: fingerprint,
      reason: `Signature is intact and bound to ${fingerprint}.`
    });
  });
}
