import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  fmString,
  fmList,
  serializeFrontmatter,
  updateFrontmatterFields,
} from "../frontmatter";

const doc = (yaml: string, body = "Body text.\n"): string => `---\n${yaml}\n---\n${body}`;

describe("parseFrontmatter", () => {
  it("parses plain scalars and keeps the body", () => {
    const fm = parseFrontmatter(doc("name: reviewer\nmodel: opus"));
    expect(fm.hasFrontmatter).toBe(true);
    expect(fm.fields).toEqual({ name: "reviewer", model: "opus" });
    expect(fm.body).toBe("Body text.\n");
  });

  it("returns raw input as body when there is no frontmatter", () => {
    const fm = parseFrontmatter("# Just markdown\n");
    expect(fm.hasFrontmatter).toBe(false);
    expect(fm.fields).toEqual({});
    expect(fm.body).toBe("# Just markdown\n");
  });

  it("treats an unclosed fence as no frontmatter", () => {
    const raw = "---\nname: broken\nNo closing fence.";
    const fm = parseFrontmatter(raw);
    expect(fm.hasFrontmatter).toBe(false);
    expect(fm.body).toBe(raw);
  });

  it("handles CRLF line endings", () => {
    const fm = parseFrontmatter("---\r\nname: crlf\r\nmodel: haiku\r\n---\r\nBody.");
    expect(fm.fields).toEqual({ name: "crlf", model: "haiku" });
    expect(fm.body).toBe("Body.");
  });

  it("strips matching surrounding quotes", () => {
    const fm = parseFrontmatter(doc(`model: "opus"\nname: 'quoted name'`));
    expect(fm.fields.model).toBe("opus");
    expect(fm.fields.name).toBe("quoted name");
  });

  it("does not strip mismatched quotes", () => {
    const fm = parseFrontmatter(doc(`name: "it's fine`));
    expect(fm.fields.name).toBe(`"it's fine`);
  });

  it("cuts inline comments outside quotes", () => {
    const fm = parseFrontmatter(doc("model: opus # the big one"));
    expect(fm.fields.model).toBe("opus");
  });

  it("keeps # inside quoted values", () => {
    const fm = parseFrontmatter(doc(`description: "issue #42 tracker"`));
    expect(fm.fields.description).toBe("issue #42 tracker");
  });

  it("keeps # without preceding whitespace (anchors, colors)", () => {
    const fm = parseFrontmatter(doc("color: value#fragment"));
    expect(fm.fields.color).toBe("value#fragment");
  });

  it("keeps values containing colons", () => {
    const fm = parseFrontmatter(doc("description: usage: run the thing"));
    expect(fm.fields.description).toBe("usage: run the thing");
  });

  it("parses inline flow lists with mixed quoting", () => {
    const fm = parseFrontmatter(doc(`tools: [Read, "Grep", 'Bash']`));
    expect(fm.fields.tools).toEqual(["Read", "Grep", "Bash"]);
  });

  it("parses block lists (indented and column-0 items)", () => {
    const indented = parseFrontmatter(doc("tools:\n  - Read\n  - Grep\nmodel: opus"));
    expect(indented.fields.tools).toEqual(["Read", "Grep"]);
    expect(indented.fields.model).toBe("opus");

    const flush = parseFrontmatter(doc("tools:\n- Read\n- Grep"));
    expect(flush.fields.tools).toEqual(["Read", "Grep"]);
  });

  it("strips comments and quotes from block list items", () => {
    const fm = parseFrontmatter(doc(`tools:\n  - "Read" # file access\n  - Grep`));
    expect(fm.fields.tools).toEqual(["Read", "Grep"]);
  });

  it("folds `>` block scalars to a single line", () => {
    const fm = parseFrontmatter(doc("description: >-\n  Multi-line\n  folded text.\nmodel: opus"));
    expect(fm.fields.description).toBe("Multi-line folded text.");
    expect(fm.fields.model).toBe("opus");
  });

  it("preserves newlines in `|` block scalars", () => {
    const fm = parseFrontmatter(doc("description: |\n  line one\n  line two"));
    expect(fm.fields.description).toBe("line one\nline two");
  });

  it("treats a key with no value and no list as an empty scalar", () => {
    const fm = parseFrontmatter(doc("description:\nmodel: opus"));
    expect(fm.fields.description).toBe("");
    expect(fm.fields.model).toBe("opus");
  });

  it("skips nested map lines without corrupting later keys", () => {
    const fm = parseFrontmatter(doc("metadata:\n  owner: me\n  team: core\nmodel: opus"));
    expect(fm.fields.metadata).toBe("");
    expect(fm.fields.model).toBe("opus");
    expect(fm.fields.owner).toBeUndefined();
  });

  it("last duplicate key wins", () => {
    const fm = parseFrontmatter(doc("model: opus\nmodel: haiku"));
    expect(fm.fields.model).toBe("haiku");
  });
});

describe("fmString / fmList", () => {
  const fm = parseFrontmatter(doc("name: reviewer\ntools: [Read, Grep]"));

  it("fmString returns scalars only", () => {
    expect(fmString(fm, "name")).toBe("reviewer");
    expect(fmString(fm, "tools")).toBeUndefined();
    expect(fmString(fm, "missing")).toBeUndefined();
  });

  it("fmList returns lists only", () => {
    expect(fmList(fm, "tools")).toEqual(["Read", "Grep"]);
    expect(fmList(fm, "name")).toBeUndefined();
    expect(fmList(fm, "missing")).toBeUndefined();
  });
});

describe("serializeFrontmatter", () => {
  it("round-trips scalars and lists back through the parser", () => {
    const raw = serializeFrontmatter(
      { name: "reviewer", model: "opus", tools: ["Read", "Grep"] },
      "You are a reviewer.\n",
    );
    const fm = parseFrontmatter(raw);
    expect(fm.fields).toEqual({ name: "reviewer", model: "opus", tools: ["Read", "Grep"] });
    expect(fm.body).toBe("You are a reviewer.\n");
  });

  it("preserves insertion order of fields", () => {
    const raw = serializeFrontmatter({ b: "2", a: "1" });
    expect(raw.indexOf("b: 2")).toBeLessThan(raw.indexOf("a: 1"));
  });

  it("quotes values that would otherwise mis-parse", () => {
    const raw = serializeFrontmatter({ description: "usage: run it # now", empty: "" });
    expect(parseFrontmatter(raw).fields.description).toBe("usage: run it # now");
    expect(parseFrontmatter(raw).fields.empty).toBe("");
  });

  it("produces a valid empty body when none is given", () => {
    const fm = parseFrontmatter(serializeFrontmatter({ name: "x" }));
    expect(fm.hasFrontmatter).toBe(true);
    expect(fm.fields.name).toBe("x");
  });
});

describe("updateFrontmatterFields", () => {
  const original = [
    "---",
    "name: reviewer",
    "model: opus",
    "permissionMode: acceptEdits",
    "color: blue",
    "---",
    "You are a reviewer.",
  ].join("\n");

  it("rewrites only the named key, preserving all others and the body", () => {
    const out = updateFrontmatterFields(original, { model: "haiku" });
    const fm = parseFrontmatter(out);
    expect(fm.fields.model).toBe("haiku");
    expect(fm.fields.name).toBe("reviewer");
    expect(fm.fields.permissionMode).toBe("acceptEdits");
    expect(fm.fields.color).toBe("blue");
    expect(fm.body).toBe("You are a reviewer.");
  });

  it("removes a key when its value is undefined", () => {
    const out = updateFrontmatterFields(original, { color: undefined });
    expect(parseFrontmatter(out).fields.color).toBeUndefined();
    expect(parseFrontmatter(out).fields.name).toBe("reviewer");
  });

  it("appends a key that was not already present", () => {
    const out = updateFrontmatterFields(original, { tools: ["Read", "Grep"] });
    expect(parseFrontmatter(out).fields.tools).toEqual(["Read", "Grep"]);
  });

  it("preserves an unrelated block-list field while editing a scalar", () => {
    const withList = "---\nname: a\ntools:\n  - Read\n  - Grep\nmodel: opus\n---\nbody";
    const out = updateFrontmatterFields(withList, { model: "haiku" });
    const fm = parseFrontmatter(out);
    expect(fm.fields.tools).toEqual(["Read", "Grep"]);
    expect(fm.fields.model).toBe("haiku");
  });

  it("replaces a block-list field without leaving orphaned item lines", () => {
    const withList = "---\nname: a\ntools:\n  - Read\n  - Grep\n---\nbody";
    const out = updateFrontmatterFields(withList, { tools: ["Bash"] });
    expect(parseFrontmatter(out).fields.tools).toEqual(["Bash"]);
    expect(out).not.toContain("- Read");
  });

  it("prepends a fresh frontmatter block when the file has none", () => {
    const out = updateFrontmatterFields("Just a body.\n", { name: "x" });
    const fm = parseFrontmatter(out);
    expect(fm.fields.name).toBe("x");
    expect(fm.body).toBe("Just a body.\n");
  });

  it("preserves CRLF line endings", () => {
    const crlf = "---\r\nname: a\r\nmodel: opus\r\n---\r\nbody";
    const out = updateFrontmatterFields(crlf, { model: "haiku" });
    expect(out).toContain("\r\n");
    expect(parseFrontmatter(out).fields.model).toBe("haiku");
  });
});
