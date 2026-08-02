// P10-US-01 / D-119: the re-sign inventory command.
//
// The population of stored approvals affected by a hashing-scheme migration
// lives in users' `.visp/` directories and cannot be measured from the
// registry. This command lets each user count their own: it walks the project
// for assurance cases and review decisions, reports which generation each case
// was hashed under, and how many decisions would need a human re-review if
// their case were regenerated — split by whether the decision is ssh_signed
// (software must never re-sign; see ADR 0003).

import path from "node:path";
import { type Dirent } from "node:fs";
import { readdir } from "node:fs/promises";

import { err, ok, type Result } from "../core/result.js";
import { VispError } from "../core/errors.js";
import { pathExists, readJsonFile } from "../core/file-system.js";
import { vispDir } from "../core/paths.js";

export type AssuranceInventoryEntry = {
  readonly casePath: string;
  readonly caseVersion: string;
  readonly caseHash: string;
  readonly decisions: readonly {
    readonly decisionPath: string;
    readonly identityAssurance: string;
    readonly boundCaseHash: string;
    readonly boundToThisCase: boolean;
  }[];
};

export type AssuranceInventoryReport = {
  readonly root: string;
  readonly cases: readonly AssuranceInventoryEntry[];
  readonly totals: {
    readonly cases: number;
    readonly legacyCases: number;
    readonly decisions: number;
    readonly decisionsOnLegacyCases: number;
    readonly signedDecisionsOnLegacyCases: number;
  };
};

type LooseCase = {
  readonly version?: unknown;
  readonly caseHash?: unknown;
};

type LooseDecision = {
  readonly identityAssurance?: unknown;
  readonly assuranceCase?: { readonly sha256?: unknown };
};

async function findAssuranceCases(rootDir: string): Promise<string[]> {
  const found: string[] = [];
  const pending: string[] = [rootDir];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    let entries: Dirent[];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        pending.push(entryPath);
      } else if (entry.isFile() && entry.name === "assurance-case.json") {
        found.push(entryPath);
      }
    }
  }
  return found.sort();
}

async function readDecisions(
  caseDir: string,
  boundHash: string
): Promise<AssuranceInventoryEntry["decisions"]> {
  const decisionPaths: string[] = [];
  const current = path.join(caseDir, "review-decision.json");
  const currentExists = await pathExists(current);
  if (currentExists.ok && currentExists.value) {
    decisionPaths.push(current);
  }
  const historyDir = path.join(caseDir, "review-decisions");
  try {
    for (const entry of await readdir(historyDir)) {
      if (entry.endsWith(".json")) decisionPaths.push(path.join(historyDir, entry));
    }
  } catch {
    // No history directory: nothing to add.
  }
  const decisions: {
    decisionPath: string;
    identityAssurance: string;
    boundCaseHash: string;
    boundToThisCase: boolean;
  }[] = [];
  for (const decisionPath of decisionPaths.sort()) {
    const parsed = await readJsonFile<LooseDecision>(decisionPath);
    if (!parsed.ok) continue;
    const identityAssurance =
      typeof parsed.value.identityAssurance === "string"
        ? parsed.value.identityAssurance
        : "unknown";
    const boundCaseHash =
      typeof parsed.value.assuranceCase?.sha256 === "string"
        ? parsed.value.assuranceCase.sha256
        : "unknown";
    decisions.push({
      decisionPath,
      identityAssurance,
      boundCaseHash,
      boundToThisCase: boundCaseHash === boundHash
    });
  }
  return decisions;
}

export async function runAssuranceInventoryWorkflow(options: {
  readonly targetPath?: string;
  readonly cwd?: string;
}): Promise<Result<AssuranceInventoryReport, VispError>> {
  const root = path.resolve(options.cwd ?? process.cwd(), options.targetPath ?? ".");
  const visp = vispDir(root);
  const exists = await pathExists(visp);
  if (!exists.ok) return exists;
  if (!exists.value) {
    return err(new VispError("VALIDATION_FAILED", `No .visp directory found under ${root}.`));
  }
  const casePaths = await findAssuranceCases(visp);
  const cases: AssuranceInventoryEntry[] = [];
  for (const casePath of casePaths) {
    const parsed = await readJsonFile<LooseCase>(casePath);
    if (!parsed.ok) continue;
    const caseVersion = typeof parsed.value.version === "string" ? parsed.value.version : "unknown";
    const caseHash = typeof parsed.value.caseHash === "string" ? parsed.value.caseHash : "unknown";
    cases.push({
      casePath,
      caseVersion,
      caseHash,
      decisions: await readDecisions(path.dirname(casePath), caseHash)
    });
  }
  const allDecisions = cases.flatMap((entry) =>
    entry.decisions.map((decision) => ({ decision, caseVersion: entry.caseVersion }))
  );
  const legacy = (version: string): boolean => version === "1.0";
  return ok({
    root,
    cases,
    totals: {
      cases: cases.length,
      legacyCases: cases.filter((entry) => legacy(entry.caseVersion)).length,
      decisions: allDecisions.length,
      decisionsOnLegacyCases: allDecisions.filter((item) => legacy(item.caseVersion)).length,
      signedDecisionsOnLegacyCases: allDecisions.filter(
        (item) => legacy(item.caseVersion) && item.decision.identityAssurance === "ssh_signed"
      ).length
    }
  });
}

export function formatAssuranceInventory(report: AssuranceInventoryReport): string {
  const lines = [
    `Assurance inventory for ${report.root}`,
    `Cases: ${report.totals.cases} (${report.totals.legacyCases} on legacy hash generation 1.0)`,
    `Decisions: ${report.totals.decisions} (${report.totals.decisionsOnLegacyCases} bound to legacy cases)`,
    `Signed decisions on legacy cases (human re-review required if regenerated): ${report.totals.signedDecisionsOnLegacyCases}`
  ];
  return `${lines.join("\n")}\n`;
}
