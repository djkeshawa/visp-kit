import { describe, expect, it } from "vitest";

import { renderCurrentTaskPrompt, renderTaskPrompt } from "../../../src/context/prompt-renderer.js";
import {
  agentMarkedChecklistSteps,
  implementationChecklistSteps
} from "../../../src/context/implementation-checklist.js";
import { validContextPack } from "../artifacts/fixtures.js";

describe("prompt renderer", () => {
  it("renders one document with Facts, Rules, Steps, and If blocked sections", () => {
    const prompt = renderTaskPrompt({
      contextPath: ".visp/features/001-note-pinning/context/T001.context.md",
      checklistPath: ".visp/features/001-note-pinning/context/T001.implementation-checklist.md",
      pack: validContextPack
    });

    expect(prompt).toContain("# Visp Task: T001 - Add note sorting helper");
    expect(prompt).toContain("## Facts");
    expect(prompt).toContain("## Rules");
    expect(prompt).toContain("## Steps");
    expect(prompt).toContain("## If blocked");
    expect(prompt).toContain(".visp/features/001-note-pinning/context/T001.context.md");
    expect(prompt).toContain(
      ".visp/features/001-note-pinning/context/T001.implementation-checklist.md"
    );
    expect(prompt).toContain("Implement only T001");
    expect(prompt).toContain("The user request is raw intent only");
  });

  it("inlines requirement and acceptance criterion titles in Facts", () => {
    const prompt = renderTaskPrompt({
      contextPath: "context.md",
      pack: validContextPack
    });

    const requirement = validContextPack.includedRequirements[0]!;
    const criterion = validContextPack.includedAcceptanceCriteria[0]!;

    expect(prompt).toContain(`${requirement.id}: ${requirement.title}`);
    expect(prompt).toContain(`${criterion.id} (${criterion.validationMethod}):`);
  });

  it("embeds the exact checklist update command for every agent-marked step", () => {
    const prompt = renderTaskPrompt({
      contextPath: "context.md",
      pack: validContextPack
    });

    for (const step of agentMarkedChecklistSteps) {
      expect(implementationChecklistSteps).toContain(step);
      expect(prompt).toContain(
        `visp-kit checklist update --task T001 --item ${step} --status done`
      );
    }
  });

  it("finishes through visp-kit done with both usage variants", () => {
    const prompt = renderTaskPrompt({
      contextPath: "context.md",
      pack: validContextPack
    });

    expect(prompt).toContain("visp-kit done --task T001 --input-tokens <n> --output-tokens <n>");
    expect(prompt).toContain("visp-kit done --task T001 --usage-unavailable");
  });

  it("does not authorize implementation when the gate is blocked", () => {
    const prompt = renderTaskPrompt({
      contextPath: "context.md",
      pack: {
        ...validContextPack,
        strictnessMode: "locked",
        policyGate: {
          strictnessMode: "locked",
          policyStatus: "valid",
          stage: "implement",
          allowed: false,
          failedRules: [
            {
              ruleId: "VSP007",
              severity: "error",
              message: "Implementation requires a context pack.",
              recommendation: "Run visp-kit context --next.",
              evidence: "Context pack missing."
            }
          ],
          blockedCommands: [
            {
              command: "implementation",
              reason: "No context pack exists.",
              ruleId: "VSP007"
            }
          ],
          overriddenRules: [],
          appliedOverrides: [],
          warnings: [],
          nextAllowedCommand: "visp-kit context --next",
          evaluatedAt: "2026-01-01T00:00:00.000Z"
        }
      }
    });

    expect(prompt).toContain("does not authorize implementation");
    expect(prompt).toContain("VSP007");
    expect(prompt).toContain("Next allowed command: visp-kit context --next");
    expect(prompt).toContain("Strictness mode: locked");
  });

  it("appends the feature prompt path for the current task prompt", () => {
    const prompt = renderCurrentTaskPrompt({
      promptPath: ".visp/features/001-note-pinning/prompts/task.prompt.md",
      contextPath: "context.md",
      pack: validContextPack
    });

    expect(prompt).toContain("Feature-specific prompt:");
    expect(prompt).toContain(".visp/features/001-note-pinning/prompts/task.prompt.md");
  });
});
