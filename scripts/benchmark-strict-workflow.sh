#!/usr/bin/env bash
# Reproducible benchmark: runs the full strict Visp workflow against a fixture
# project, proves scope violations are caught mechanically, and prints the
# deterministic benchmark metrics. No LLM is called at any point.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VISP=(node "$ROOT_DIR/dist/index.js")

if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
  echo "dist/index.js is missing. Run pnpm build first." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
echo "Benchmark project: $tmpdir"

"${VISP[@]}" init "$tmpdir" --preset typescript --budget lean --strictness strict

cat > "$tmpdir/package.json" <<'JSON'
{
  "name": "visp-benchmark-fixture",
  "packageManager": "pnpm@11.3.0",
  "scripts": {
    "test": "node -e \"console.log('tests passed')\"",
    "typecheck": "node -e \"console.log('typecheck passed')\""
  },
  "devDependencies": {}
}
JSON

mkdir -p "$tmpdir/src" "$tmpdir/tests"
cat > "$tmpdir/src/notes.ts" <<'TS'
export interface Note {
  id: string;
  title: string;
  pinned?: boolean;
}

export function pinNote(note: Note): Note {
  return { ...note, pinned: true };
}
TS
cat > "$tmpdir/tests/notes.test.ts" <<'TS'
import { pinNote } from "../src/notes";

test("pinNote", () => {
  expect(pinNote({ id: "1", title: "n" }).pinned).toBe(true);
});
TS

git -C "$tmpdir" init
git -C "$tmpdir" config user.email "visp@example.com"
git -C "$tmpdir" config user.name "Visp Benchmark"
git -C "$tmpdir" add .
git -C "$tmpdir" commit -m "initial fixture"

# Planning pipeline.
"${VISP[@]}" scan "$tmpdir"
"${VISP[@]}" constitution "$tmpdir" --preset typescript --budget lean
"${VISP[@]}" policy validate "$tmpdir"
"${VISP[@]}" feature "Add note pinning" "$tmpdir"
"${VISP[@]}" clarify "$tmpdir"
"${VISP[@]}" spec "$tmpdir" --force
"${VISP[@]}" plan "$tmpdir" --force
"${VISP[@]}" tasks "$tmpdir" --force
"${VISP[@]}" context T001 "$tmpdir" --force
"${VISP[@]}" gate implement "$tmpdir" --task T001
"${VISP[@]}" hooks git "$tmpdir"

# Category: mechanical enforcement. Stage a deliberately out-of-scope edit and
# prove the generated pre-commit hook blocks it.
echo "export const outOfScope = true;" > "$tmpdir/src/unrelated-module.ts"
git -C "$tmpdir" add src/unrelated-module.ts
if git -C "$tmpdir" commit -m "out of scope change"; then
  echo "ERROR: out-of-scope commit was NOT blocked" >&2
  exit 1
else
  echo "OK: out-of-scope commit was blocked by the pre-commit hook"
fi
# Unstage and remove only the out-of-scope file. A hard reset would also
# revert tracked .visp state (status.json) and clear the active feature.
git -C "$tmpdir" reset HEAD src/unrelated-module.ts
rm -f "$tmpdir/src/unrelated-module.ts"

# Category: drift detection. Edit the spec after the context pack was compiled
# and prove visp-kit drift fails closed in strict mode.
node -e "
const fs = require('fs');
const p = process.argv[1];
const spec = JSON.parse(fs.readFileSync(p, 'utf8'));
spec.title = spec.title + ' (edited after context)';
fs.writeFileSync(p, JSON.stringify(spec, null, 2) + '\n');
" "$tmpdir/.visp/features/001-add-note-pinning/spec.json"
if "${VISP[@]}" drift "$tmpdir" --json > "$tmpdir/drift-output.json"; then
  echo "ERROR: drift was NOT detected" >&2
  exit 1
else
  echo "OK: stale context provenance was detected by visp-kit drift"
fi

# Refresh the pack so the final metrics reflect a clean state.
"${VISP[@]}" context T001 "$tmpdir" --force
"${VISP[@]}" drift "$tmpdir"

# Category: deterministic metrics.
"${VISP[@]}" eval "$tmpdir" --benchmark --json | node -e "
let data = '';
process.stdin.on('data', (chunk) => { data += chunk; });
process.stdin.on('end', () => {
  const report = JSON.parse(data);
  console.log('--- benchmark metrics ---');
  console.log(JSON.stringify(report.metrics, null, 2));
});
"

echo "Benchmark workflow complete."
