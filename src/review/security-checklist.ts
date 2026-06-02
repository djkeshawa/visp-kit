import {
  type ReviewChangedFile,
  type SecurityChecklistItem
} from "../artifacts/schemas/review.schema.js";
import { type Task } from "../artifacts/schemas/task.schema.js";
import { finding, type ReviewFindingDraft } from "./review-findings.js";

function item(input: {
  readonly id: string;
  readonly category: string;
  readonly attention?: "standard" | "high";
  readonly text: string;
  readonly reason: string;
}): SecurityChecklistItem {
  return {
    id: input.id,
    category: input.category,
    attention: input.attention ?? "standard",
    text: input.text,
    reason: input.reason
  };
}

export function securityChecklist(input: {
  readonly changedFiles: readonly ReviewChangedFile[];
  readonly task?: Task;
}): {
  readonly checklist: readonly SecurityChecklistItem[];
  readonly findings: readonly ReviewFindingDraft[];
} {
  const paths = input.changedFiles.map((file) => file.path.toLowerCase());
  const checklist: SecurityChecklistItem[] = [
    item({
      id: "SEC001",
      category: "secrets",
      text: "Confirm no secrets, tokens, or credentials are added or logged.",
      reason: "Standard security review item."
    }),
    item({
      id: "SEC002",
      category: "input validation",
      text: "Confirm new external inputs are validated and safely handled.",
      reason: "Standard security review item."
    }),
    item({
      id: "SEC003",
      category: "permissions",
      text: "Confirm authorization and permission checks are preserved.",
      reason: "Standard security review item."
    }),
    item({
      id: "SEC004",
      category: "error handling",
      text: "Confirm errors do not expose sensitive implementation details.",
      reason: "Standard security review item."
    })
  ];

  const addHigh = (id: string, category: string, text: string, reason: string): void => {
    checklist.push(item({ id, category, attention: "high", text, reason }));
  };

  if (paths.some((file) => /auth|permission|session|token|secret/.test(file))) {
    addHigh(
      "SEC005",
      "authentication/authorization",
      "Review authentication, authorization, session, token, and secret handling carefully.",
      "Changed file path contains auth/permission/session/token/secret."
    );
  }

  if (paths.some((file) => /api|route|controller|handler/.test(file))) {
    addHigh(
      "SEC006",
      "network/API changes",
      "Confirm API handlers validate inputs and enforce authorization.",
      "Changed file path contains api/route/controller/handler."
    );
  }

  if (paths.some((file) => /ipc|preload|electron|main/.test(file))) {
    addHigh(
      "SEC007",
      "Electron IPC",
      "Confirm IPC/preload/main-process changes expose only safe, minimal capabilities.",
      "Changed file path contains ipc/preload/electron/main."
    );
  }

  if (paths.some((file) => /db|repository|migration|schema/.test(file))) {
    addHigh(
      "SEC008",
      "data exposure",
      "Confirm data access, migrations, and schema changes preserve privacy and integrity.",
      "Changed file path contains db/repository/migration/schema."
    );
  }

  if (input.changedFiles.some((file) => file.isDependencyFile)) {
    addHigh(
      "SEC009",
      "dependency additions",
      "Review dependency changes for package trust, lockfile integrity, and supply-chain risk.",
      "Dependency-sensitive files changed."
    );
  }

  const findings = checklist
    .filter((entry) => entry.attention === "high")
    .map((entry) =>
      finding({
        category: "security/privacy",
        severity: "warning",
        title: `${entry.category} review needed`,
        description: "The changed files match a deterministic security/privacy review signal.",
        evidence: entry.reason,
        recommendation: entry.text,
        relatedTaskId: input.task?.id ?? null,
        relatedRequirementIds: input.task?.requirementIds ?? [],
        relatedAcceptanceCriterionIds: input.task?.acceptanceCriterionIds ?? []
      })
    );

  return { checklist, findings };
}
