import { type AssuranceCase } from "../artifacts/schemas/assurance-case.schema.js";

function escapeMarkdown(value: string): string {
  const escaped = value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("|", "&#124;")
    .replaceAll("`", "&#96;")
    .replaceAll("!", "&#33;")
    .replaceAll("[", "&#91;")
    .replaceAll("]", "&#93;")
    .replaceAll("(", "&#40;")
    .replaceAll(")", "&#41;")
    .replaceAll("\\", "&#92;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "<br>");
  return [...escaped]
    .map((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127 ? `&#x${code.toString(16).padStart(2, "0")};` : character;
    })
    .join("");
}

function list(values: readonly string[]): string {
  return values.length === 0 ? "none" : values.map(escapeMarkdown).join(", ");
}

function optional(value: string | null | undefined): string {
  return value === undefined ? "undefined" : value === null ? "null" : escapeMarkdown(value);
}

export function renderAssuranceCase(assuranceCase: AssuranceCase): string {
  return [
    "# Assurance Case",
    "",
    `- Task: ${escapeMarkdown(assuranceCase.taskId)}`,
    `- Profile: ${assuranceCase.assuranceProfile}`,
    `- Verdict: ${assuranceCase.verdict}`,
    `- Case hash: ${assuranceCase.caseHash}`,
    `- Action: ${assuranceCase.actionId}`,
    `- Diff: ${assuranceCase.diff.mode} ${escapeMarkdown(assuranceCase.diff.baseRevision)} → ${escapeMarkdown(assuranceCase.diff.targetRevision)}`,
    `- Snapshot: ${assuranceCase.diff.snapshotSha256}`,
    "",
    "## Bindings and code states",
    "",
    "| ID | Role | Status | Path | Hash / reason |",
    "| --- | --- | --- | --- | --- |",
    ...assuranceCase.bindings.map(
      (binding) =>
        `| ${escapeMarkdown(binding.id)} | ${binding.role} | ${binding.status} | ${escapeMarkdown(binding.path)} | ${binding.status === "available" ? binding.sha256 : escapeMarkdown(binding.reason)} |`
    ),
    "",
    `- Baseline: ${assuranceCase.codeStates.baseline.status === "captured" ? `${escapeMarkdown(assuranceCase.codeStates.baseline.revision)} / ${assuranceCase.codeStates.baseline.sha256}` : escapeMarkdown(assuranceCase.codeStates.baseline.reason)}`,
    `- Candidate: ${assuranceCase.codeStates.candidate.status === "captured" ? `${escapeMarkdown(assuranceCase.codeStates.candidate.revision)} / ${assuranceCase.codeStates.candidate.sha256}` : escapeMarkdown(assuranceCase.codeStates.candidate.reason)}`,
    "",
    "## Change units",
    "",
    ...(assuranceCase.changeUnits.length === 0
      ? ["None."]
      : assuranceCase.changeUnits.map((unit) =>
          unit.kind === "hunk"
            ? `- ${escapeMarkdown(unit.id)} hunk ${escapeMarkdown(unit.path)} old=${unit.oldStart},${unit.oldLines} new=${unit.newStart},${unit.newLines} occurrence=${unit.occurrence}`
            : `- ${escapeMarkdown(unit.id)} ${unit.category} ${escapeMarkdown(unit.beforePath ?? "none")} → ${escapeMarkdown(unit.afterPath ?? "none")}${unit.category === "mode" ? ` mode=${escapeMarkdown(unit.beforeMode ?? "none")}→${escapeMarkdown(unit.afterMode ?? "none")}` : ""}`
        )),
    "",
    "## Claims",
    "",
    "| ID | Disposition | Priority | Statement | Change units | Evidence |",
    "| --- | --- | --- | --- | --- | --- |",
    ...assuranceCase.claims.map(
      (claim) =>
        `| ${escapeMarkdown(claim.id)} | ${claim.disposition} | ${claim.priority} | ${escapeMarkdown(claim.statement)} | ${list(claim.changeUnitIds)} | ${list(claim.evidenceComparisonIds)} |`
    ),
    "",
    "## Evidence",
    "",
    "| ID | Provider | Claims | Baseline | Candidate | Conclusion |",
    "| --- | --- | --- | --- | --- | --- |",
    ...assuranceCase.evidenceComparisons.map(
      (comparison) =>
        `| ${escapeMarkdown(comparison.id)} | ${list(comparison.providers.map((provider) => `${provider.id}@${provider.version}`))} | ${list(comparison.claimIds)} | ${comparison.baseline.outcome}/${comparison.baseline.freshness}/${comparison.baseline.independence}; ${escapeMarkdown(comparison.baseline.source.bindingId)} [${list(comparison.baseline.source.evidenceIds)}]; uncertainty=${comparison.baseline.uncertainty.status} [${list(comparison.baseline.uncertainty.reasons)}] | ${comparison.candidate.outcome}/${comparison.candidate.freshness}/${comparison.candidate.independence}; ${escapeMarkdown(comparison.candidate.source.bindingId)} [${list(comparison.candidate.source.evidenceIds)}]; uncertainty=${comparison.candidate.uncertainty.status} [${list(comparison.candidate.uncertainty.reasons)}] | ${comparison.conclusion} |`
    ),
    "",
    "## Hotspots",
    "",
    ...(assuranceCase.hotspots.length === 0
      ? ["None."]
      : assuranceCase.hotspots.map(
          (hotspot) =>
            `- ${escapeMarkdown(hotspot.id)} ${hotspot.severity}/${hotspot.category} mandatory=${String(hotspot.mandatory)}: ${escapeMarkdown(hotspot.reason)}; path=${hotspot.path === null ? "none" : escapeMarkdown(hotspot.path)}; claims=[${list(hotspot.claimIds)}]; units=[${list(hotspot.changeUnitIds)}]`
        )),
    "",
    "## Assumptions and overrides",
    "",
    ...(assuranceCase.assumptions.length === 0
      ? ["Assumptions: none."]
      : assuranceCase.assumptions.map(
          (assumption) =>
            `- Assumption ${escapeMarkdown(assumption.id)}: ${escapeMarkdown(assumption.statement)}; bindings=[${list(assumption.sourceBindingIds)}]`
        )),
    ...(assuranceCase.overrides.length === 0
      ? ["Overrides: none."]
      : assuranceCase.overrides.map(
          (override) =>
            `- Override ${escapeMarkdown(override.id)}: id=${escapeMarkdown(override.record.id)}; ruleId=${escapeMarkdown(override.record.ruleId)}; scope=${override.record.scope}; status=${override.record.status}; featureId=${optional(override.record.featureId)}; featureSlug=${optional(override.record.featureSlug)}; taskId=${optional(override.record.taskId)}; stage=${optional(override.record.stage)}; createdBy=${escapeMarkdown(override.record.createdBy)}; createdAt=${escapeMarkdown(override.record.createdAt)}; expiresAt=${optional(override.record.expiresAt)}; revokedAt=${optional(override.record.revokedAt)}; revokedReason=${optional(override.record.revokedReason)}; reason=${escapeMarkdown(override.record.reason)}; claims=[${list(override.claimIds)}]`
        )),
    "",
    "## Unresolved",
    "",
    ...(assuranceCase.unresolvedItems.length === 0
      ? ["None."]
      : assuranceCase.unresolvedItems.map(
          (item) => `- ${escapeMarkdown(item.id)}: ${escapeMarkdown(item.reason)}`
        )),
    "",
    "## Manual checks and challenger findings",
    "",
    ...(assuranceCase.manualChecks.length === 0
      ? ["Manual checks: none."]
      : assuranceCase.manualChecks.map(
          (check) =>
            `- ${escapeMarkdown(check.id)} ${check.status}: ${escapeMarkdown(check.description)}; claims=[${list(check.claimIds)}]`
        )),
    ...(assuranceCase.challengerFindings.length === 0
      ? ["Challenger findings: none."]
      : assuranceCase.challengerFindings.map(
          (finding) =>
            `- ${escapeMarkdown(finding.id)} ${finding.severity}/${finding.status}: ${escapeMarkdown(finding.summary)}; claims=[${list(finding.claimIds)}]`
        )),
    "",
    "## Next action",
    "",
    `${escapeMarkdown(assuranceCase.nextAction.command)} — ${escapeMarkdown(assuranceCase.nextAction.reason)}`,
    ""
  ].join("\n");
}
