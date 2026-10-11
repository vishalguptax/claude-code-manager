import { describe, expect, it } from "vitest";
import { latestReleaseDate, parseChangelog, renderChangelog } from "../changelog.mjs";
import { esc, formatInt, pathOf, strip } from "../html.mjs";
import { fillTokens } from "../layout.mjs";
import { indexNowPayload } from "../indexnow.mjs";
import { readBuiltinCommands, readHookEvents } from "../srcdata.mjs";
import { compareVersions, pickVersion, resolveStats, totalDownloads } from "../stats.mjs";

describe("html helpers", () => {
  it("escapes text for HTML", () => {
    expect(esc(`<a href="x">Tom's & co</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;Tom&#39;s &amp; co&lt;/a&gt;");
  });
  it("strips a fragment to plain text", () => {
    expect(strip("The <em class=\"serif\">session&nbsp;manager</em> &amp; more")).toBe("The session manager & more");
  });
  it("maps slugs to URL paths", () => {
    expect(pathOf("")).toBe("/");
    expect(pathOf("guides/x")).toBe("/guides/x/");
  });
  it("formats counts with separators", () => {
    expect(formatInt(66981)).toBe("66,981");
  });
});

describe("fillTokens", () => {
  it("replaces known tokens", () => {
    expect(fillTokens("v{{version}} · {{hub:guides}}", { version: "2.18.0", "hub:guides": "<ul/>" })).toBe("v2.18.0 · <ul/>");
  });
  it("throws on an unknown token rather than shipping braces", () => {
    expect(() => fillTokens("{{nope}}", {})).toThrow("unknown token {{nope}}");
  });
});

describe("versions", () => {
  it("compares numerically, not as strings", () => {
    expect(compareVersions("2.10.0", "2.9.9")).toBe(1);
    expect(compareVersions("2.18.0", "2.18.0")).toBe(0);
    expect(compareVersions("1.0", "1.0.1")).toBe(-1);
  });
  it("picks the newer of published and repo versions (a bumped, unpublished release shows its own number)", () => {
    expect(pickVersion("2.18.0", "2.19.0")).toBe("2.19.0");
    expect(pickVersion("2.18.0", "2.17.0")).toBe("2.18.0");
    expect(pickVersion(undefined, "2.18.0")).toBe("2.18.0");
  });
});

describe("resolveStats", () => {
  const fallback = {
    marketplaceInstalls: 1,
    openVsxDownloads: 2,
    stars: 3,
    marketplaceVersion: "1.0.0",
    openVsxVersion: "1.0.0",
  };
  const json = (body: unknown) => ({ ok: true, json: async () => body });

  it("keeps the committed value for a source that fails, and warns", async () => {
    const warnings: string[] = [];
    const fetchImpl = async (url: string) => {
      if (url.includes("marketplace")) {
        return json({
          results: [{ extensions: [{ versions: [{ version: "2.18.0" }], statistics: [{ statisticName: "install", value: 2351.4 }] }] }],
        });
      }
      if (url.includes("open-vsx")) throw new Error("ECONNRESET");
      return { ok: false, status: 503, json: async () => ({}) };
    };
    const s = await resolveStats({ fallback, fetchImpl, warn: (m: string) => warnings.push(m) });
    expect(s.marketplaceInstalls).toBe(2351);
    expect(s.openVsxDownloads).toBe(2);
    expect(s.stars).toBe(3);
    expect(s.publishedVersion).toBe("2.18.0");
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toMatch(/Open VSX fetch failed/);
    expect(warnings[1]).toMatch(/GitHub fetch failed \(github 503\)/);
  });

  it("adds both stores for the downloads figure", () => {
    expect(totalDownloads({ marketplaceInstalls: 2351, openVsxDownloads: 64630 })).toBe(66981);
  });
});

describe("changelog", () => {
  const md = `# Changelog

## [2.18.0] - 2026-10-03

The Config tab is regrouped. See [notes](docs/releases/v2.18.0.md) and \`code\`.

## [2.0.0] - 2026-09-01

### Added

- **Bold** item that wraps
  onto a second line.
- <script>alert(1)</script>
`;
  it("parses releases, subheadings and wrapped bullets", () => {
    const r = parseChangelog(md);
    expect(r.map((x) => x.version)).toEqual(["2.18.0", "2.0.0"]);
    expect(r[1].blocks).toEqual([
      { type: "h3", text: "Added" },
      { type: "ul", items: ["**Bold** item that wraps onto a second line.", "<script>alert(1)</script>"] },
    ]);
  });
  it("renders escaped HTML with repo links made absolute", () => {
    const html = renderChangelog(md);
    expect(html).toContain('<a href="https://github.com/vishalguptax/claude-code-manager/blob/main/docs/releases/v2.18.0.md">notes</a>');
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<strong>Bold</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('id="v2.18.0"');
  });
  it("reports the newest release date", () => {
    expect(latestReleaseDate(md)).toBe("2026-10-03");
  });
});

describe("srcdata", () => {
  it("reads built-in commands as slash commands", () => {
    const src = `const BUILTIN_COMMANDS: ReadonlyArray<readonly [string, string]> = [
  ["add-dir", "Add a working directory"],
  ["clear", "Clear conversation history (aliases: /reset, /new)"],
];`;
    expect(readBuiltinCommands(src)).toEqual([
      { name: "/add-dir", description: "Add a working directory" },
      { name: "/clear", description: "Clear conversation history (aliases: /reset, /new)" },
    ]);
  });
  it("reads hook events written on one or several lines", () => {
    const src = `export const KNOWN_HOOK_EVENTS: readonly HookEventInfo[] = [
  { name: "SessionStart", label: "Session Start", description: "When a session starts" },
  {
    name: "UserPromptSubmit",
    label: "User Prompt Submit",
    description: "Before a submitted prompt is processed",
  },
];`;
    expect(readHookEvents(src).map((e) => e.name)).toEqual(["SessionStart", "UserPromptSubmit"]);
  });
  it("throws when the list is missing, so a renamed constant fails the build", () => {
    expect(() => readBuiltinCommands("const OTHER = [];")).toThrow(/BUILTIN_COMMANDS not found/);
    expect(() => readHookEvents("export const KNOWN_HOOK_EVENTS = [];")).toThrow(/no hook events/);
  });
});

describe("indexNowPayload", () => {
  it("lists every sitemap URL with the key and its location", () => {
    const xml = "<urlset><url><loc>https://x.dev/</loc></url><url><loc>https://x.dev/a/</loc></url></urlset>";
    expect(indexNowPayload(xml, "https://x.dev", "abc")).toEqual({
      host: "x.dev",
      key: "abc",
      keyLocation: "https://x.dev/abc.txt",
      urlList: ["https://x.dev/", "https://x.dev/a/"],
    });
  });
  it("refuses an empty sitemap", () => {
    expect(() => indexNowPayload("<urlset/>", "https://x.dev", "abc")).toThrow(/no <loc>/);
  });
});
