import { describe, expect, it } from "vitest";

import {
  isPlaceholderText,
  placeholderFindings,
  placeholderReason
} from "../../../src/validators/semantic-lint.js";

describe("placeholder detection and domain vocabulary", () => {
  // Found by driving the toolchain on a real todo application: every artifact
  // that mentioned the `todo` command — and the feature slug itself, which the
  // user cannot edit — was rejected as placeholder text. A project whose
  // domain word collides with a marker must still be able to validate.
  it("accepts lowercase 'todo' as an ordinary domain word", () => {
    expect(isPlaceholderText("Reject invalid dates; the todo is not added.")).toBe(false);
    expect(isPlaceholderText("When the user runs `todo add` with --due")).toBe(false);
  });

  it("accepts a feature slug containing the word todo", () => {
    expect(isPlaceholderText("add-a-due-date-to-todos-todo-add-accepts-due")).toBe(false);
  });

  it("still rejects the conventional uppercase TODO marker", () => {
    expect(isPlaceholderText("TODO: decide the date format")).toBe(true);
    expect(placeholderReason("TODO: decide the date format")).toContain('"TODO"');
  });

  it("still rejects TBD and TBC in any case", () => {
    expect(isPlaceholderText("tbd")).toBe(true);
    expect(isPlaceholderText("This is Tbc.")).toBe(true);
  });

  it("still rejects empty strings and angle-bracket templates", () => {
    expect(isPlaceholderText("   ")).toBe(true);
    expect(isPlaceholderText("<describe your feature>")).toBe(true);
    expect(isPlaceholderText("<your feature request>")).toBe(true);
  });

  // Same session, same project: the spec's usage line `todo add <title> --due`
  // was rejected because <title> matched the template pattern. Single-token
  // angle brackets are CLI and markup notation; the templates Visp seeds are
  // multi-word phrases, and only those should count as placeholders.
  it("accepts single-token angle brackets as CLI or markup notation", () => {
    expect(isPlaceholderText("todo add <title> --due YYYY-MM-DD")).toBe(false);
    expect(isPlaceholderText("Render the value inside a <div> element.")).toBe(false);
    expect(isPlaceholderText("visp-kit context --task <task-id>")).toBe(false);
  });

  it("reports no findings for an artifact about todos", () => {
    const artifact = {
      featureSlug: "add-a-due-date-to-todos-todo-add",
      question: "Should `todo add` reject an invalid --due date?"
    };
    expect(placeholderFindings(artifact, "clarifications")).toEqual([]);
  });
});
