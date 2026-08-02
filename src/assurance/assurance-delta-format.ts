import { type AssuranceDelta } from "./assurance-delta.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";

/**
 * Renders a delta for a human returning to a change they already reviewed.
 *
 * The order is deliberate: the verdict first, then only the things that
 * invalidate it, then the things that do not. Someone who reads one line should
 * get the answer, and someone who reads everything should not have to sort
 * consequential changes from harmless ones themselves.
 */
export function formatAssuranceDelta(delta: AssuranceDelta): string {
  const lines: string[] = [
    formatHeader(
      delta.unchanged
        ? "Visp assurance delta — nothing moved."
        : delta.decisionStale
          ? "Visp assurance delta — your earlier review no longer covers this."
          : "Visp assurance delta — your earlier review still stands."
    ),
    "",
    delta.summary,
    "",
    formatKeyValue("Reviewed at", delta.trustedDecidedAt),
    formatKeyValue("Decision", delta.trustedDecisionHash)
  ];

  if (delta.unchanged) {
    lines.push("", "Nothing to re-read.");

    return `${lines.join("\n")}\n`;
  }

  const invalidating = delta.changes.filter((change) => change.invalidatesDecision);
  const informational = delta.changes.filter((change) => !change.invalidatesDecision);

  if (invalidating.length > 0) {
    lines.push("", "These mean the earlier review no longer applies:");

    for (const change of invalidating) {
      lines.push(`  - ${change.label}`);
      lines.push(`      was: ${abbreviate(change.trusted)}`);
      lines.push(`      now: ${abbreviate(change.current)}`);
    }
  }

  if (informational.length > 0) {
    // Kept separate and clearly labelled. Folding these in with the
    // invalidating changes would make gaining evidence look like a problem.
    lines.push("", "These changed but do not invalidate it:");

    for (const change of informational) {
      lines.push(
        `  - ${change.label} (${abbreviate(change.trusted)} → ${abbreviate(change.current)})`
      );
    }
  }

  lines.push(
    "",
    "Next:",
    delta.decisionStale
      ? "  Re-review, then run visp-kit assurance accept or reject."
      : "  No action required. Re-review only if the new evidence changes your view."
  );

  return `${lines.join("\n")}\n`;
}

/** Hashes are unreadable at full length and the first characters identify them. */
function abbreviate(value: string): string {
  const bare = value.startsWith("sha256:") ? value.slice(7) : value;

  return /^[0-9a-f]{40,}$/u.test(bare) ? `${bare.slice(0, 12)}…` : value;
}
