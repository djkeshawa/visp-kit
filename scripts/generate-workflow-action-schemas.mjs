import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { build } from "tsup";

const root = path.resolve(import.meta.dirname, "..");
const outputRoot = path.join(root, "schemas", "workflow-action");
const checkOnly = process.argv.includes("--check");
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "visp-workflow-action-schema-"));

function formatSchemaText(input, artifactPath) {
  const biomeCli = path.join(root, "node_modules", "@biomejs", "biome", "bin", "biome");
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [biomeCli, "format", "--stdin-file-path", artifactPath], {
      cwd: root,
      stdio: ["pipe", "pipe", "pipe"]
    });
    let output = "";
    let errors = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(`Biome schema formatting failed with exit ${code}: ${errors}`));
      }
    });
    child.stdin.end(input);
  });
}

try {
  await build({
    entry: [path.join(root, "src", "integration", "workflow-action-schema.ts")],
    outDir: temporaryRoot,
    format: ["esm"],
    platform: "node",
    target: "node22",
    bundle: true,
    splitting: false,
    sourcemap: false,
    clean: true,
    dts: false,
    minify: false,
    silent: true,
    noExternal: ["zod"],
    config: false
  });

  const bundledPath = path.join(temporaryRoot, "workflow-action-schema.js");
  const schemaModule = await import(`${pathToFileURL(bundledPath).href}?v=${Date.now()}`);
  const protocols = schemaModule.SUPPORTED_WORKFLOW_ACTION_PROTOCOLS;
  const expectedFileNames = new Set(protocols.map((protocol) => `${protocol}.schema.json`));

  if (!checkOnly) {
    await mkdir(outputRoot, { recursive: true });
  }

  const stale = [];
  if (checkOnly) {
    const entries = await readdir(outputRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile() || !expectedFileNames.has(entry.name)) {
        stale.push(path.relative(root, path.join(outputRoot, entry.name)));
      }
    }
  }

  for (const protocol of protocols) {
    const artifactPath = path.join(outputRoot, `${protocol}.schema.json`);
    const generatedHash = schemaModule.generatedWorkflowActionSchemaHash(protocol);
    const acceptedHash = schemaModule.workflowActionSchemaHash(protocol);
    if (generatedHash !== acceptedHash) {
      throw new Error(
        `Generated workflow-action ${protocol} schema hash ${generatedHash} does not match accepted runtime hash ${acceptedHash}. Review the schema change and update the accepted hash.`
      );
    }
    const expected = await formatSchemaText(
      `${JSON.stringify(schemaModule.generateWorkflowActionSchemaDocument(protocol), null, 2)}\n`,
      artifactPath
    );

    if (checkOnly) {
      const actual = await readFile(artifactPath, "utf8").catch(() => undefined);
      if (actual !== expected) stale.push(path.relative(root, artifactPath));
    } else {
      await writeFile(artifactPath, expected, "utf8");
    }
  }

  if (stale.length > 0) {
    throw new Error(
      `Workflow-action schema artifacts are stale or missing: ${stale.join(", ")}. Run pnpm schema:generate.`
    );
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
