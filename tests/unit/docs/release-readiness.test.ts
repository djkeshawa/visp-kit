import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { createCli } from "../../../src/cli/main.js";

const root = process.cwd();

function read(relativePath: string): string {
  return readFileSync(path.join(root, relativePath), "utf8");
}

describe("release documentation readiness", () => {
  it("has the required strict agent-native docs", () => {
    for (const file of [
      "README.md",
      "docs/quickstart.md",
      "docs/workflow.md",
      "docs/commands.md",
      "docs/policy-and-gates.md",
      "docs/agent-native-workflows.md",
      "docs/agent-targets.md",
      "docs/overrides.md",
      "docs/token-efficiency.md",
      "docs/company-adoption.md",
      "docs/troubleshooting.md",
      "docs/release-checklist.md",
      "docs/development.md"
    ]) {
      expect(existsSync(path.join(root, file)), file).toBe(true);
    }
  });

  it("documents all implemented top-level commands", () => {
    const commands = read("docs/commands.md");

    for (const command of [
      "init",
      "scan",
      "constitution",
      "feature",
      "clarify",
      "spec",
      "plan",
      "tasks",
      "context",
      "budget",
      "verify",
      "review",
      "reconcile",
      "status",
      "next",
      "doctor",
      "pr",
      "policy",
      "gate",
      "agent",
      "override"
    ]) {
      expect(commands).toContain(`visp ${command}`);
    }
  });

  it("uses only registered top-level commands in the README first run", () => {
    const readme = read("README.md");
    const firstRunHeading = "## First run";
    const firstRunStart = readme.indexOf(firstRunHeading);

    expect(firstRunStart).toBeGreaterThanOrEqual(0);

    const afterFirstRunHeading = readme.slice(firstRunStart + firstRunHeading.length);
    const nextHeadingStart = afterFirstRunHeading.search(/^## /m);

    expect(nextHeadingStart).toBeGreaterThan(0);

    const firstRun = afterFirstRunHeading.slice(0, nextHeadingStart);
    const documentedCommands = [...firstRun.matchAll(/^visp\s+([a-z][a-z0-9-]*)\b/gm)].map(
      (match) => match[1]
    );

    expect(documentedCommands.length).toBeGreaterThan(0);

    const registeredCommands = new Set(createCli().commands.map((command) => command.name()));
    const unregisteredCommands = documentedCommands.filter(
      (command) => !registeredCommands.has(command)
    );

    expect(unregisteredCommands).toEqual([]);
  });

  it("documents strict policy rules and overrides", () => {
    const policy = read("docs/policy-and-gates.md");
    const overrides = read("docs/overrides.md");

    for (let index = 1; index <= 20; index += 1) {
      expect(policy).toContain(`VSP${String(index).padStart(3, "0")}`);
    }

    expect(overrides).toContain("VSP019");
    expect(overrides).toContain("VSP020");
    expect(overrides).toContain("non-overridable");
  });

  it("documents all agent targets and does not claim direct LLM execution", () => {
    const targets = read("docs/agent-targets.md");
    const readme = read("README.md");

    for (const target of ["codex", "generic", "claude", "copilot", "opencode"]) {
      expect(targets).toContain(`visp agent install ${target}`);
    }

    expect(readme).toContain("does not call");
    expect(readme).toContain("The user prompt is raw intent only");
  });

  it("documents GitHub Spec Kit as a separate install", () => {
    const docs = [
      read("README.md"),
      read("docs/quickstart.md"),
      read("docs/spec-vs-visp-kit.md")
    ].join("\n");

    expect(docs).toContain(
      "uv tool install specify-cli --from git+https://github.com/github/spec-kit.git@vX.Y.Z"
    );
    expect(docs).toContain("specify init my-project --integration copilot");
    expect(docs).toContain("Visp Kit does not install");
  });

  it("keeps package metadata ready for future publishing", () => {
    const pkg = JSON.parse(read("package.json")) as {
      description: string;
      bin?: Record<string, string>;
      files?: string[];
    };

    // The description is the one line shown in npm search results, so it is
    // pinned for shape rather than for wording. Requiring a specific phrase
    // froze the jargon it happened to start with and blocked plain English.
    expect(pkg.description.length).toBeGreaterThan(40);
    expect(pkg.description.length).toBeLessThan(300);

    // The claim ceiling applies to package metadata too. No study has run, so
    // a description promising speed or productivity would be an unsubstantiated
    // claim in the most visible place the project has.
    expect(pkg.description).not.toMatch(/faster|productivity|10x|boost|save time/iu);
    expect(pkg.bin?.visp).toBe("dist/index.js");
    expect(pkg.files).toEqual(
      expect.arrayContaining([
        "dist",
        "docs",
        "examples",
        "README.md",
        "LICENSE",
        "CONTRIBUTING.md"
      ])
    );
  });

  it("has a strict workflow example and dogfood script", () => {
    expect(existsSync(path.join(root, "examples/strict-agent-workflow/README.md"))).toBe(true);
    expect(existsSync(path.join(root, "scripts/dogfood-strict-agent-workflow.sh"))).toBe(true);
    expect(read("docs/release-checklist.md")).toContain("scripts/dogfood-strict-agent-workflow.sh");
  });

  it("does not document unsupported run orchestration as implemented", () => {
    const docs = [
      "README.md",
      "docs/quickstart.md",
      "docs/workflow.md",
      "docs/commands.md",
      "docs/policy-and-gates.md",
      "docs/agent-native-workflows.md",
      "docs/agent-targets.md",
      "docs/overrides.md"
    ]
      .map(read)
      .join("\n");

    expect(docs).not.toContain("visp run");
  });
});
