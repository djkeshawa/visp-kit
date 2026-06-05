#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VISP=(node "$ROOT_DIR/dist/index.js")

if [[ ! -f "$ROOT_DIR/dist/index.js" ]]; then
  echo "dist/index.js is missing. Run pnpm build first." >&2
  exit 1
fi

tmpdir="$(mktemp -d)"
echo "Dogfood project: $tmpdir"

"${VISP[@]}" agent bootstrap codex "$tmpdir" --preset typescript --budget lean --strictness strict

cat > "$tmpdir/package.json" <<'JSON'
{
  "name": "visp-strict-dogfood",
  "packageManager": "pnpm@11.3.0",
  "scripts": {
    "test": "node -e \"console.log('tests passed')\"",
    "typecheck": "node -e \"console.log('typecheck passed')\""
  },
  "devDependencies": {}
}
JSON

mkdir -p "$tmpdir/src"
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

git -C "$tmpdir" init
git -C "$tmpdir" config user.email "visp@example.com"
git -C "$tmpdir" config user.name "Visp Test"
git -C "$tmpdir" add .
git -C "$tmpdir" commit -m "initial fixture"

"${VISP[@]}" scan "$tmpdir"
"${VISP[@]}" constitution "$tmpdir" --preset typescript --budget lean
"${VISP[@]}" policy validate "$tmpdir"
"${VISP[@]}" agent doctor "$tmpdir" --target codex

"${VISP[@]}" feature "Add note pinning" "$tmpdir"
"${VISP[@]}" clarify "$tmpdir"
"${VISP[@]}" spec "$tmpdir" --force
"${VISP[@]}" plan "$tmpdir" --force
"${VISP[@]}" tasks "$tmpdir" --force
"${VISP[@]}" context T001 "$tmpdir" --force

"${VISP[@]}" gate implement "$tmpdir" --task T001
"${VISP[@]}" budget "$tmpdir"
"${VISP[@]}" status "$tmpdir"
"${VISP[@]}" next "$tmpdir"
"${VISP[@]}" doctor "$tmpdir"

"${VISP[@]}" override create VSP014 "$tmpdir" \
  --scope task \
  --feature 001 \
  --task T001 \
  --reason "Dogfood example records manual verification for this temporary fixture."

"${VISP[@]}" override validate "$tmpdir"
"${VISP[@]}" override list "$tmpdir"

echo "Dogfood workflow complete."
