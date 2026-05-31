import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./stripFrontmatter";

describe("stripFrontmatter", () => {
  it("removes leading YAML frontmatter and trims the body", () => {
    const raw = "---\nname: x\nmodel: opus\n---\nYou are a reviewer.\n";
    expect(stripFrontmatter(raw)).toBe("You are a reviewer.");
  });

  it("handles CRLF line endings", () => {
    const raw = "---\r\nname: x\r\n---\r\nBody here.\r\n";
    expect(stripFrontmatter(raw)).toBe("Body here.");
  });

  it("returns trimmed content unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("  just a prompt  ")).toBe("just a prompt");
  });

  it("returns an empty string when the body is empty", () => {
    expect(stripFrontmatter("---\nname: x\n---\n")).toBe("");
  });
});
