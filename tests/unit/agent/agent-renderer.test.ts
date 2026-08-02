import { describe, expect, it } from "vitest";

import {
  buildWorkflowMap,
  renderCodexSkill,
  renderGenericPrompt
} from "../../../src/agent/agent-renderer.js";

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

  it("builds a validated workflow map", () => {
    const map = buildWorkflowMap({ target: "codex" });

    expect(map.workflows).toHaveLength(5);
    expect(map.workflows.map((workflow) => workflow.name)).toContain("visp-feature");
    expect(map.workflows[0]?.target).toBe("codex");
    expect(map.workflows[0]?.entrypointFile).toBe(".agents/skills/visp-feature/SKILL.md");
  });
});
