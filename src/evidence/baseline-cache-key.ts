import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { type BaselineCacheKey } from "../artifacts/schemas/baseline-evidence.schema.js";
import { type OraclePlan } from "../artifacts/schemas/oracle-plan.schema.js";
import { VispError } from "../core/errors.js";
import { pathExists } from "../core/file-system.js";
import { err, ok, type Result } from "../core/result.js";
import { hashOracleValue } from "../oracle/oracle-authorization.js";

const lockfileCandidates = [
  "bun.lock",
  "bun.lockb",
  "Cargo.lock",
  "composer.lock",
  "deno.lock",
  "Gemfile.lock",
  "go.sum",
  "mix.lock",
  "package-lock.json",
  "pnpm-lock.yaml",
  "poetry.lock",
  "uv.lock",
  "yarn.lock"
] as const;

const configurationCandidates = [
  "biome.json",
  "biome.jsonc",
  "bunfig.toml",
  "Cargo.toml",
  "deno.json",
  "deno.jsonc",
  "eslint.config.js",
  "eslint.config.mjs",
  "go.mod",
  "go.work",
  "jest.config.js",
  "jest.config.ts",
  "package.json",
  "pnpm-workspace.yaml",
  "pyproject.toml",
  "pytest.ini",
  "ruff.toml",
  "rust-toolchain",
  "rust-toolchain.toml",
  "tox.ini",
  "tsconfig.base.json",
  "tsconfig.json",
  "turbo.json",
  "vite.config.js",
  "vite.config.ts",
  "vitest.config.js",
  "vitest.config.ts",
  ".node-version",
  ".nvmrc",
  ".python-version",
  ".tool-versions"
] as const;

async function hashExisting(
  targetPath: string,
  candidates: readonly string[]
): Promise<Result<readonly { path: string; sha256: `sha256:${string}` }[], VispError>> {
  const values: Array<{ path: string; sha256: `sha256:${string}` }> = [];
  for (const candidate of candidates) {
    const absolutePath = path.resolve(targetPath, candidate);
    const projectRelative = path.relative(targetPath, absolutePath).replaceAll("\\", "/");
    if (projectRelative === "" || projectRelative === ".." || projectRelative.startsWith("../")) {
      return err(
        new VispError(
          "VALIDATION_FAILED",
          `Baseline cache input must stay inside the project: ${candidate}.`
        )
      );
    }
    const exists = await pathExists(absolutePath);
    if (!exists.ok) return exists;
    if (!exists.value) continue;
    try {
      const contents = await readFile(absolutePath);
      values.push({
        path: projectRelative,
        sha256: `sha256:${createHash("sha256").update(contents).digest("hex")}`
      });
    } catch (error) {
      return err(
        new VispError("FILE_SYSTEM_ERROR", `Unable to hash baseline cache input ${candidate}.`, {
          cause: error,
          details: { path: absolutePath }
        })
      );
    }
  }
  return ok(values.sort((left, right) => left.path.localeCompare(right.path)));
}

async function configuredPackageManagerRuntime(
  targetPath: string
): Promise<{ id: string; major: number } | undefined> {
  try {
    const manifest = JSON.parse(await readFile(path.join(targetPath, "package.json"), "utf8")) as {
      packageManager?: unknown;
    };
    if (typeof manifest.packageManager !== "string") return undefined;
    const match = /^([A-Za-z0-9._-]+)@(\d+)/u.exec(manifest.packageManager);
    return match === null || match[1] === undefined || match[2] === undefined
      ? undefined
      : { id: match[1], major: Number.parseInt(match[2], 10) };
  } catch {
    return undefined;
  }
}

export async function createBaselineCacheKey(input: {
  readonly targetPath: string;
  readonly plan: OraclePlan;
  readonly planPath: string;
}): Promise<Result<BaselineCacheKey, VispError>> {
  const lockfiles = await hashExisting(input.targetPath, lockfileCandidates);
  if (!lockfiles.ok) return lockfiles;
  const authoritativeConfigurationPaths = [
    input.planPath,
    input.plan.bindings.policy.path,
    input.plan.bindings.specification.path,
    input.plan.bindings.plan.path,
    input.plan.bindings.taskGraph.path,
    input.plan.bindings.context.path
  ];
  const configurations = await hashExisting(input.targetPath, [
    ...authoritativeConfigurationPaths,
    ...configurationCandidates
  ]);
  if (!configurations.ok) return configurations;
  const packageManager = await configuredPackageManagerRuntime(input.targetPath);
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  const material = {
    version: "1.0" as const,
    baseCommit: input.plan.baseCommit,
    commandSetSha256: hashOracleValue(input.plan.validationCommands),
    lockfiles: [...lockfiles.value],
    configurations: [...configurations.value],
    providers: [...input.plan.requiredProviders].sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    runtimes: [
      { id: "node", major: nodeMajor },
      ...(packageManager === undefined ? [] : [packageManager])
    ].sort((left, right) => left.id.localeCompare(right.id)),
    platform: process.platform,
    architecture: process.arch
  };

  return ok({ ...material, hash: hashOracleValue(material) });
}
