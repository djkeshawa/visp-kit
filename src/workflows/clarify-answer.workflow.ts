import path from "node:path";

import {
  clarificationsArtifactPath,
  clarificationsMarkdownPath
} from "../artifacts/artifact-paths.js";
import { readArtifact } from "../artifacts/artifact-reader.js";
import { writeArtifact } from "../artifacts/artifact-writer.js";
import {
  clarificationArtifactSchema,
  type ClarificationArtifact
} from "../artifacts/schemas/clarification.schema.js";
import { VispError } from "../core/errors.js";
import { writeTextFile } from "../core/file-system.js";
import { relativePath } from "../core/paths.js";
import { err, ok, type Result } from "../core/result.js";
import { renderClarificationsMarkdownFromArtifact } from "../templates/phase7-templates.js";
import { formatHeader, formatKeyValue } from "../theme/terminal.js";
import { validateClarifications } from "../validators/validate-clarifications.js";
import { resolveActiveFeature } from "./shared/active-feature.js";

export type ClarifyAnswerWorkflowOptions = {
  readonly targetPath?: string;
  readonly cwd?: string;
  readonly feature?: string;
  readonly questionId: string;
  readonly answer?: string;
  readonly acceptDefault?: boolean;
  readonly dryRun?: boolean;
  readonly now?: string;
};

export type ClarifyAnswerSummary = {
  readonly success: boolean;
  readonly targetPath: string;
  readonly feature: {
    readonly id: string;
    readonly slug: string;
    readonly path: string;
  };
  readonly questionId: string;
  readonly status: "answered" | "accepted_default";
  readonly answer: string;
  readonly artifactStatus: "draft_invalid" | "draft" | "ready";
  readonly dryRun: boolean;
  readonly updatedFiles: readonly string[];
  readonly validation: {
    readonly passed: boolean;
    readonly errors: readonly string[];
  };
  readonly nextCommand: string;
};

function meaningfulAnswer(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

function nextArtifactStatus(artifact: ClarificationArtifact): "draft" | "ready" {
  return artifact.questions.some(
    (question) => question.blocking && question.status === "unanswered"
  )
    ? "draft"
    : "ready";
}

export async function runClarifyAnswerWorkflow(
  options: ClarifyAnswerWorkflowOptions
): Promise<Result<ClarifyAnswerSummary, VispError>> {
  const cwd = options.cwd ?? process.cwd();
  const targetPath = path.resolve(cwd, options.targetPath ?? ".");
  const dryRun = options.dryRun ?? false;
  const now = options.now ?? new Date().toISOString();
  const feature = await resolveActiveFeature({
    targetPath,
    feature: options.feature
  });

  if (!feature.ok) return feature;

  const artifactPath = clarificationsArtifactPath(targetPath, feature.value.key);
  const markdownPath = clarificationsMarkdownPath(targetPath, feature.value.key);
  const artifact = await readArtifact(artifactPath, clarificationArtifactSchema, {
    artifactName: "clarifications"
  });

  if (!artifact.ok) {
    return err(
      new VispError(
        artifact.error.code,
        `${artifact.error.message} Run \`visp-kit clarify\` first.`
      )
    );
  }

  const question = artifact.value.questions.find((item) => item.id === options.questionId);

  if (question === undefined) {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        `Clarification question ${options.questionId} was not found.`
      )
    );
  }

  const answer = options.acceptDefault
    ? question.recommendedDefault.trim()
    : meaningfulAnswer(options.answer);

  if (answer === undefined || answer.length === 0 || answer === "TBD") {
    return err(
      new VispError(
        "VALIDATION_FAILED",
        "Provide --answer with a meaningful answer, or use --accept-default when the recommended default is meaningful."
      )
    );
  }

  const updated: ClarificationArtifact = {
    ...artifact.value,
    questions: artifact.value.questions.map((item) =>
      item.id === question.id
        ? {
            ...item,
            status: options.acceptDefault ? "accepted_default" : "answered",
            answer
          }
        : item
    ),
    updatedAt: now,
    status: "draft"
  };
  const finalArtifact: ClarificationArtifact = {
    ...updated,
    status: nextArtifactStatus(updated)
  };
  const validation = validateClarifications(finalArtifact);
  const updatedFiles = [
    relativePath(targetPath, artifactPath),
    relativePath(targetPath, markdownPath)
  ];

  if (!dryRun) {
    const writeJson = await writeArtifact(
      artifactPath,
      clarificationArtifactSchema,
      finalArtifact,
      { artifactName: "clarifications" }
    );

    if (!writeJson.ok) return writeJson;

    const writeMarkdown = await writeTextFile(
      markdownPath,
      renderClarificationsMarkdownFromArtifact({
        feature: feature.value,
        artifact: finalArtifact
      })
    );

    if (!writeMarkdown.ok) return writeMarkdown;
  }

  return ok({
    success: validation.passed,
    targetPath,
    feature: {
      id: feature.value.id,
      slug: feature.value.slug,
      path: feature.value.relativePath
    },
    questionId: question.id,
    status: options.acceptDefault ? "accepted_default" : "answered",
    answer,
    artifactStatus: finalArtifact.status,
    dryRun,
    updatedFiles,
    validation,
    nextCommand: finalArtifact.status === "ready" ? "visp-kit spec" : "visp-kit clarify"
  });
}

export function formatClarifyAnswerSummary(summary: ClarifyAnswerSummary): string {
  const lines = [
    formatHeader(
      summary.dryRun ? "Visp clarification answer dry run." : "Visp clarification answered."
    ),
    "",
    formatKeyValue("Feature", `${summary.feature.id}-${summary.feature.slug}`),
    formatKeyValue("Question", summary.questionId),
    formatKeyValue("Status", summary.status),
    formatKeyValue("Clarifications", summary.artifactStatus)
  ];

  if (summary.updatedFiles.length > 0) {
    lines.push("", "Updated:", ...summary.updatedFiles.map((file) => `  ${file}`));
  }

  if (!summary.validation.passed) {
    lines.push("", "Validation errors:", ...summary.validation.errors.map((error) => `  ${error}`));
  }

  lines.push("", "Next:", `  ${summary.nextCommand}`);

  return `${lines.join("\n")}\n`;
}
