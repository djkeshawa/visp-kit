import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type CommandResult, runCommand } from "../../../src/core/command-runner.js";

const packageRoot = path.resolve(import.meta.dirname, "../../..");
const artifactsBuild = path.join(packageRoot, "dist", "artifacts.js");

async function run(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string; readonly timeoutMs?: number }
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  const result = await runCommand(command, args, { ...options, stdioMode: "file" });
  if (!result.ok) {
    const details = result.error.details as Partial<CommandResult> | undefined;
    throw new Error(
      [
        result.error.message,
        `exitCode=${String(details?.exitCode)} signal=${String(details?.signal)} timedOut=${String(details?.timedOut)}`,
        `stdout=${JSON.stringify(details?.stdout ?? "")}`,
        `stderr=${JSON.stringify(details?.stderr ?? "")}`
      ].join("\n"),
      { cause: result.error }
    );
  }
  expect(result.value.exitCode, result.value.stderr).toBe(0);
  return result.value;
}

function parseJsonOutput<T>(
  label: string,
  result: { readonly stdout: string; readonly stderr: string }
): T {
  const stdout = result.stdout.trim();
  expect(
    stdout,
    `${label} produced empty stdout. stderr=${JSON.stringify(result.stderr)}`
  ).not.toBe("");

  try {
    return JSON.parse(stdout) as T;
  } catch (error) {
    throw new Error(
      `${label} produced invalid JSON. stdout=${JSON.stringify(result.stdout)} stderr=${JSON.stringify(result.stderr)}`,
      { cause: error }
    );
  }
}

describe("external package surface", () => {
  let fixturePath: string;

  beforeAll(async () => {
    try {
      await access(artifactsBuild);
    } catch {
      await run("pnpm", ["build"], { cwd: packageRoot, timeoutMs: 300_000 });
    }

    fixturePath = await mkdtemp(path.join(os.tmpdir(), "visp-kit-package-surface-"));
    const nodeModulesPath = path.join(fixturePath, "node_modules");
    await mkdir(nodeModulesPath, { recursive: true });
    await symlink(
      packageRoot,
      path.join(nodeModulesPath, "visp-kit"),
      process.platform === "win32" ? "junction" : "dir"
    );
  }, 320_000);

  afterAll(async () => {
    await rm(fixturePath, { recursive: true, force: true });
  });

  it("resolves the new reader without hiding previously shipped package paths", async () => {
    const specifiers = [
      "visp-kit/artifacts",
      "visp-kit/package.json",
      "visp-kit/schemas/workflow-action/3.2.schema.json",
      "visp-kit/dist/index.js"
    ];
    const cockpitReaderMethods = [
      "projectProfile",
      "projectConfig",
      "projectStatus",
      "policy",
      "workflowManifest",
      "featureIntent",
      "specification",
      "plan",
      "taskGraph",
      "verification",
      "taskReview",
      "assuranceCase",
      "currentReviewDecision",
      "reviewDecision",
      "runIndex",
      "constitution",
      "patterns",
      "projectSummary",
      "doctorReport"
    ];
    const program = `
      const artifacts = await import("visp-kit/artifacts");
      if (typeof artifacts.createArtifactReader !== "function") throw new Error("reader missing");
      if (typeof artifacts.artifactSchemas?.runEvent?.parse !== "function") throw new Error("run schema missing");
      const reader = artifacts.createArtifactReader(process.cwd());
      const missingMethods = ${JSON.stringify(cockpitReaderMethods)}.filter((method) => typeof reader[method] !== "function");
      if (missingMethods.length > 0) throw new Error("reader methods missing: " + missingMethods.join(","));
      const resolved = Object.fromEntries(${JSON.stringify(specifiers)}.map((specifier) => [specifier, import.meta.resolve(specifier)]));
      process.stdout.write(JSON.stringify(resolved));
    `;

    const result = await run(process.execPath, ["--input-type=module", "--eval", program], {
      cwd: fixturePath,
      timeoutMs: 30_000
    });
    const resolved = parseJsonOutput<Record<string, string>>("external package resolver", result);

    expect(Object.keys(resolved)).toEqual(specifiers);
    expect(resolved["visp-kit/artifacts"]).toMatch(/\/dist\/artifacts\.js$/u);
    expect(resolved["visp-kit/package.json"]).toMatch(/\/package\.json$/u);
    expect(resolved["visp-kit/schemas/workflow-action/3.2.schema.json"]).toMatch(
      /\/schemas\/workflow-action\/3\.2\.schema\.json$/u
    );
    expect(resolved["visp-kit/dist/index.js"]).toMatch(/\/dist\/index\.js$/u);

    const manifest = JSON.parse(await readFile(path.join(packageRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const cli = await run(
      process.execPath,
      [path.join(fixturePath, "node_modules", "visp-kit", "dist", "index.js"), "--version"],
      { cwd: fixturePath, timeoutMs: 30_000 }
    );
    expect(cli.stdout.trim()).toBe(manifest.version);
  });

  it("typechecks a consumer through the built artifacts declaration", async () => {
    const consumerPath = path.join(fixturePath, "consumer.mts");
    await writeFile(
      consumerPath,
      [
        'import { artifactSchemas, createArtifactReader, type ArtifactReadState } from "visp-kit/artifacts";',
        'const state: Promise<ArtifactReadState<unknown>> = createArtifactReader(".").projectStatus();',
        "const parsed = artifactSchemas.runEvent.parse;",
        "void state;",
        "void parsed;",
        ""
      ].join("\n"),
      "utf8"
    );

    await run(
      process.execPath,
      [
        path.join(packageRoot, "node_modules", "typescript", "bin", "tsc"),
        "--noEmit",
        "--strict",
        "--skipLibCheck",
        "--target",
        "ES2022",
        "--module",
        "NodeNext",
        "--moduleResolution",
        "NodeNext",
        consumerPath
      ],
      { cwd: fixturePath, timeoutMs: 60_000 }
    );
  });

  it("includes the reader, declarations, schemas, metadata, and CLI in the tarball inventory", async () => {
    const result = await run("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
      cwd: packageRoot,
      timeoutMs: 120_000
    });
    const packed = parseJsonOutput<Array<{ files: Array<{ path: string }> }>>(
      "npm pack --dry-run",
      result
    );
    const files = packed.flatMap((entry) => entry.files.map(({ path: filePath }) => filePath));

    expect(files).toEqual(
      expect.arrayContaining([
        "dist/artifacts.js",
        "dist/artifacts.d.ts",
        "dist/index.js",
        "package.json",
        "schemas/workflow-action/3.2.schema.json"
      ])
    );
  }, 140_000);
});
