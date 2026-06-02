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
    expect(help).toContain("constitution");
    expect(help).toContain("feature");
    expect(help).toContain("init");
    expect(help).toContain("scan");
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
      if (
        !(error instanceof CommanderError) ||
        error.code !== "commander.version"
      ) {
        throw error;
      }
    }

    expect(output.join("")).toContain("0.0.0");
  });

  it("prints init command help", () => {
    const help = createCli().commands.find((command) => command.name() === "init")
      ?.helpInformation();

    expect(help).toContain("Usage: visp init [options] [path]");
    expect(help).toContain("--agent");
    expect(help).toContain("--budget");
    expect(help).toContain("--preset");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints scan command help", () => {
    const help = createCli().commands.find((command) => command.name() === "scan")
      ?.helpInformation();

    expect(help).toContain("Usage: visp scan [options] [path]");
    expect(help).toContain("--changed");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
  });

  it("prints feature command help", () => {
    const help = createCli().commands
      .find((command) => command.name() === "feature")
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
    const help = createCli().commands
      .find((command) => command.name() === "constitution")
      ?.helpInformation();

    expect(help).toContain("Usage: visp constitution [options] [path]");
    expect(help).toContain("--preset");
    expect(help).toContain("--budget");
    expect(help).toContain("--force");
    expect(help).toContain("--dry-run");
    expect(help).toContain("--json");
    expect(help).toContain("--validate");
  });
});
