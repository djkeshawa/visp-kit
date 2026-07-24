import { CommanderError } from "commander";
import { describe, expect, it } from "vitest";

import { createCli } from "../../src/cli/main.js";

describe("createCli", () => {
  it("prints basic help for the visp command", () => {
    const help = createCli().helpInformation();

    expect(help).toContain("Usage: visp [options]");
    expect(help).toContain("Small context. Clear specs. Accurate code.");
    expect(help).toContain("-h, --help");
    expect(help).toContain("-V, --version");
    expect(help).toContain("agent");
    expect(help).toContain("budget");
    expect(help).toContain("clarify");
    expect(help).toContain("constitution");
    expect(help).toContain("context");
    expect(help).toContain("doctor");
    expect(help).toContain("drift");
    expect(help).toContain("eval");
    expect(help).toContain("feature");
    expect(help).toContain("gate");
    expect(help).toContain("init");
    expect(help).toContain("integration");
    expect(help).toContain("next");
    expect(help).toContain("oracle");
    expect(help).toContain("override");
    expect(help).toContain("plan");
    expect(help).toContain("policy");
    expect(help).toContain("pr");
    expect(help).toContain("reconcile");
    expect(help).toContain("review");
    expect(help).toContain("scan");
    expect(help).toContain("spec");
    expect(help).toContain("status");
    expect(help).toContain("tasks");
    expect(help).toContain("verify");
    expect(help).toContain("workflow");
  });

  it("prints the CLI version", () => {
    const output: string[] = [];
    const program = createCli();

    program.configureOutput({
      writeOut: (value) => output.push(value),
      writeErr: (value) => output.push(value)
    });
    program.exitOverride();

    try {
      program.parse(["node", "visp", "--version"]);
    } catch (error) {
      if (!(error instanceof CommanderError) || error.code !== "commander.version") {
        throw error;
      }
    }

    expect(output.join("")).toContain("0.1.1");
  });

  it("prints drift command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "drift")
      ?.helpInformation();

    expect(help).toContain("Usage: visp drift [options] [path]");
    expect(help).toContain("--task");
    expect(help).toContain("--strict");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints init command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "init")
      ?.helpInformation();

    expect(help).toContain("Usage: visp init [options] [path]");
    expect(help).toContain("--agent");
    expect(help).toContain("--budget");
    expect(help).toContain("--preset");
    expect(help).toContain("--strictness");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints scan command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "scan")
      ?.helpInformation();

    expect(help).toContain("Usage: visp scan [options] [path]");
    expect(help).toContain("--changed");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints feature command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "feature")
      ?.helpInformation();

    expect(help).toContain("Usage: visp feature [options] <feature idea> [path]");
    expect(help).toContain("--budget");
    expect(help).toContain("--risk");
    expect(help).toContain("--branch");
    expect(help).toContain("--no-branch");
    expect(help).toContain("--branch-name");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints constitution command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "constitution")
      ?.helpInformation();

    expect(help).toContain("Usage: visp constitution [options] [path]");
    expect(help).toContain("--preset");
    expect(help).toContain("--budget");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
    expect(help).toContain("--validate");
  });

  it("prints phase 7 command help", () => {
    for (const name of ["clarify", "spec", "plan", "tasks"]) {
      const help = createCli()
        .commands.find((command) => command.name() === name)
        ?.helpInformation();

      expect(help).toContain(
        name === "clarify"
          ? "Usage: visp clarify [options] [command] [path]"
          : `Usage: visp ${name} [options] [path]`
      );
      expect(help).toContain("--feature");
      expect(help).toContain("--force");
      expect(help).toContain("--dry-run");
      expect(help).toContain("--json");
      expect(help).toContain("--validate");
      expect(help).toContain("--prompt-only");
      if (name === "clarify") {
        expect(help).toContain("answer [options] <question-id> [path]");
      }
    }
  });

  it("prints context command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "context")
      ?.helpInformation();

    expect(help).toContain("Usage: visp context [options] [task-id] [path]");
    expect(help).toContain("--next");
    expect(help).toContain("--feature");
    expect(help).toContain("--budget");
    expect(help).toContain("--max-tokens");
    expect(help).toContain("--include-full-files");
    expect(help).toContain("--prompt-only");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints oracle command help", () => {
    const oracle = createCli().commands.find((command) => command.name() === "oracle");

    expect(oracle?.commands.map((command) => command.name())).toEqual([
      "plan",
      "validate",
      "approve",
      "revoke",
      "lock"
    ]);
    expect(
      oracle?.commands.find((command) => command.name() === "plan")?.helpInformation()
    ).toContain("--pre-approved-test");
  });

  it("prints budget command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "budget")
      ?.helpInformation();

    expect(help).toContain("Usage: visp budget [options] [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--budget");
    expect(help).toContain("--max-tokens");
    expect(help).toContain("--write-report");
    expect(help).toContain("--record-usage");
    expect(help).toContain("--input-tokens");
    expect(help).toContain("--output-tokens");
    expect(help).toContain("--total-tokens");
    expect(help).toContain("--model");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints hooks command help", () => {
    const hooks = createCli().commands.find((command) => command.name() === "hooks");

    expect(hooks).toBeDefined();
    expect(hooks?.commands.map((command) => command.name())).toEqual(["claude", "git", "ci"]);

    for (const name of ["claude", "git", "ci"]) {
      const help = hooks?.commands.find((command) => command.name() === name)?.helpInformation();

      expect(help).toContain("--force");
      expect(help).toContain("--dry-run");
      expect(help).toContain("--json");
    }
  });

  it("prints done command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "done")
      ?.helpInformation();

    expect(help).toContain("Usage: visp done [options] [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--input-tokens");
    expect(help).toContain("--output-tokens");
    expect(help).toContain("--model");
    expect(help).toContain("--usage-note");
    expect(help).toContain("--usage-unavailable");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints verify command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "verify")
      ?.helpInformation();

    expect(help).toContain("Usage: visp verify [options] [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--targeted");
    expect(help).toContain("--all");
    expect(help).toContain("--commands");
    expect(help).toContain("--skip-commands");
    expect(help).toContain("--artifacts");
    expect(help).toContain("--traceability");
    expect(help).toContain("--scope");
    expect(help).toContain("--dependencies");
    expect(help).toContain("--update-task-status");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints review command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "review")
      ?.helpInformation();

    expect(help).toContain("Usage: visp review [options] [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--diff-only");
    expect(help).toContain("--staged");
    expect(help).toContain("--unstaged");
    expect(help).toContain("--base");
    expect(help).toContain("--prompt-only");
    expect(help).toContain("--checklist-only");
    expect(help).toContain("--skip-verification");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints reconcile command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "reconcile")
      ?.helpInformation();

    expect(help).toContain("Usage: visp reconcile [options] [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--staged");
    expect(help).toContain("--unstaged");
    expect(help).toContain("--base");
    expect(help).toContain("--update-traceability");
    expect(help).toContain("--update-task-status");
    expect(help).toContain("--prompt-only");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints orchestration command help", () => {
    const expected = {
      status: ["--feature", "--task", "--verbose", "--write-report", "--json"],
      next: ["--feature", "--task", "--command-only", "--explain", "--strict", "--json"],
      doctor: ["--check", "--fix", "--dry-run", "--verbose", "--json"],
      pr: [
        "--feature",
        "--task",
        "--base",
        "--staged",
        "--unstaged",
        "--title",
        "--prompt-only",
        "--force",
        "--dry-run",
        "--json"
      ]
    };

    for (const [name, flags] of Object.entries(expected)) {
      const help = createCli()
        .commands.find((command) => command.name() === name)
        ?.helpInformation();

      expect(help).toContain(`Usage: visp ${name} [options] [path]`);
      for (const flag of flags) {
        expect(help).toContain(flag);
      }
    }
  });

  it("prints integration command help", () => {
    const integration = createCli().commands.find((command) => command.name() === "integration");

    expect(integration?.helpInformation()).toContain("Usage: visp integration [options] [command]");

    const help = integration?.commands
      .find((command) => command.name() === "contract")
      ?.helpInformation();

    expect(help).toContain("Usage: visp integration contract [options] [path]");
    expect(help).toContain("--json");
  });

  it("prints policy command help", () => {
    const policy = createCli().commands.find((command) => command.name() === "policy");

    expect(policy?.helpInformation()).toContain("Usage: visp policy [options] [command]");

    const expected = {
      init: ["--strictness", "--force", "--dry-run", "--json"],
      show: ["--json"],
      validate: ["--json"],
      "set-strictness": ["--dry-run", "--json"]
    };

    for (const [name, flags] of Object.entries(expected)) {
      const help = policy?.commands.find((command) => command.name() === name)?.helpInformation();

      expect(help).toContain(`Usage: visp policy ${name}`);
      for (const flag of flags) {
        expect(help).toContain(flag);
      }
    }
  });

  it("prints gate command help", () => {
    const help = createCli()
      .commands.find((command) => command.name() === "gate")
      ?.helpInformation();

    expect(help).toContain("Usage: visp gate [options] <stage> [path]");
    expect(help).toContain("--feature");
    expect(help).toContain("--task");
    expect(help).toContain("--strictness");
    expect(help).toContain("--explain");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints override command help", () => {
    const override = createCli().commands.find((command) => command.name() === "override");

    expect(override?.helpInformation()).toContain("Usage: visp override [options] [command]");

    const expected = {
      create: [
        "--reason",
        "--scope",
        "--feature",
        "--task",
        "--stage",
        "--expires",
        "--dry-run",
        "--json"
      ],
      list: ["--active", "--revoked", "--expired", "--rule", "--feature", "--task", "--json"],
      show: ["--json"],
      revoke: ["--reason", "--dry-run", "--json"],
      validate: ["--json"]
    };

    for (const [name, flags] of Object.entries(expected)) {
      const help = override?.commands.find((command) => command.name() === name)?.helpInformation();

      expect(help).toContain(`Usage: visp override ${name}`);
      for (const flag of flags) {
        expect(help).toContain(flag);
      }
    }
  });

  it("prints agent command help", () => {
    const agent = createCli().commands.find((command) => command.name() === "agent");

    expect(agent?.helpInformation()).toContain("Usage: visp agent [options] [command]");

    const expected = {
      list: ["--json"],
      install: ["--force", "--dry-run", "--json", "--strictness"],
      doctor: ["--target", "--fix", "--dry-run", "--json"],
      refresh: ["--target", "--force", "--dry-run", "--json"]
    };

    for (const [name, flags] of Object.entries(expected)) {
      const help = agent?.commands.find((command) => command.name() === name)?.helpInformation();

      expect(help).toContain(`Usage: visp agent ${name}`);
      for (const flag of flags) {
        expect(help).toContain(flag);
      }
    }
  });
});
