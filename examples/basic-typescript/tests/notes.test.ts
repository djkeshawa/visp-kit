import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { pinNote, unpinNote } from "../src/notes.js";

describe("notes", () => {
  it("pins a note", () => {
    assert.equal(pinNote({ id: "1", title: "A" }).pinned, true);
  });

  it("unpins a note", () => {
    assert.equal(unpinNote({ id: "1", title: "A", pinned: true }).pinned, false);
  });
});
