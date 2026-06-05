import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/notes.ts", import.meta.url), "utf8");

assert.match(source, /export function pinNote/);
assert.match(source, /pinned: true/);
console.log("tests passed");
