import { describe, expect, it } from "vitest";

import {
  buildWorkflowMap,
  renderAgentsMarkdown,
  renderCodexSkill,
  renderCursorBaseRule,
  renderGenericPrompt
} from "../../../src/agent/agent-renderer.js";
import { memoryEntryCommands } from "../../../src/agent/templates/shared-agent-rules.js";

describe("agent renderer", () => {
  it("renders Codex skills with metadata and Visp rules", () => {
    const skill = renderCodexSkill("task", "strict");

    expect(skill).toContain("---");
    expect(skill).toContain("name: visp-task");
    expect(skill).toContain("user prompt is raw intent");
    expect(skill).toContain("visp-kit gate");
  });

  it("renders generic prompts with strict workflow rules", () => {
    const prompt = renderGenericPrompt("pr", "locked");

    expect(prompt).toContain("# Visp Agent Pr Prompt");
    expect(prompt).toContain("visp-kit gate pr");
    expect(prompt).toContain("Do not call GitHub API");
  });

  it("names visp-memory in AGENTS.md when memory was detected", () => {
    const contents = renderAgentsMarkdown({
      target: "generic",
      strictness: "strict",
      memoryDetected: true
    });

    expect(contents).toContain("visp-memory");
    expect(contents).toContain(memoryEntryCommands.recall);
    expect(contents).toContain("non-authoritative");
  });

  it("leaves memory out of AGENTS.md when memory was not detected", () => {
    const contents = renderAgentsMarkdown({
      target: "generic",
      strictness: "strict",
      memoryDetected: false
    });

    expect(contents).not.toContain("visp-memory");
    expect(contents).toContain("Full shared rules:");
  });

  it("carries the same memory guidance into the always-applied Cursor rule", () => {
    const rule = renderCursorBaseRule({ strictness: "standard", memoryDetected: true });

    expect(rule).toContain(memoryEntryCommands.recall);
    expect(renderCursorBaseRule({ strictness: "standard", memoryDetected: false })).not.toContain(
      "visp-memory"
    );
  });

  it("builds a validated workflow map", () => {
    const map = buildWorkflowMap({ target: "codex" });

    expect(map.workflows).toHaveLength(5);
    expect(map.workflows.map((workflow) => workflow.name)).toContain("visp-feature");
    expect(map.workflows[0]?.target).toBe("codex");
    expect(map.workflows[0]?.entrypointFile).toBe(".agents/skills/visp-feature/SKILL.md");
  });
});
