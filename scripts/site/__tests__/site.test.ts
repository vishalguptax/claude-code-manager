// Contract tests for the real site: build it offline from the committed
// sources and check every page against the SEO rules the site promises
// (docs/growth/PLAN.md). No network, no git: lastmod is fixed.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bodyFile, buildSite, outFile } from "../build.mjs";
import { indexable } from "../files.mjs";
import { strip } from "../html.mjs";
import { DESCRIPTION_MAX, ogName, TITLE_MAX } from "../seo.mjs";

const root = join(__dirname, "../../..");
const stats = JSON.parse(readFileSync(join(root, "site-src/stats.json"), "utf8"));
const build = () => buildSite({ root, stats, lastmodOf: () => "2026-10-11" });
const { files, ctx } = build();
const pages = ctx.pages;
const html = (p: { slug: string; type: string }) => files.get(outFile(p)) as string;
const meta = (doc: string, key: string) =>
  doc.match(new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)"`))?.[1];

describe("site build", () => {
  it("is deterministic: two offline builds are byte-identical", () => {
    const again = build().files;
    expect([...again.keys()]).toEqual([...files.keys()]);
    for (const [k, v] of files) expect(again.get(k), k).toBe(v);
  });

  it("has a body file for every page and no orphan body files", () => {
    for (const p of pages) expect(existsSync(join(root, "site-src/pages", bodyFile(p.slug))), p.slug).toBe(true);
    const used = new Set(pages.map((p) => bodyFile(p.slug)));
    for (const f of readdirSync(join(root, "site-src/pages"))) expect(used.has(f), `orphan ${f}`).toBe(true);
  });

  it("leaves no unfilled {{tokens}} in any output", () => {
    for (const [k, v] of files) expect(v, k).not.toMatch(/\{\{[\w:-]+\}\}/);
  });
});

describe("titles and descriptions", () => {
  it(`every title is ≤ ${TITLE_MAX} chars and every description ≤ ${DESCRIPTION_MAX}`, () => {
    for (const p of pages) {
      expect(p.title.length, p.title).toBeLessThanOrEqual(TITLE_MAX);
      expect(p.description.length, p.slug).toBeLessThanOrEqual(DESCRIPTION_MAX);
    }
  });
  it("titles, descriptions and h1s are unique", () => {
    const uniq = (xs: string[]) => new Set(xs).size === xs.length;
    expect(uniq(pages.map((p) => p.title))).toBe(true);
    expect(uniq(pages.map((p) => p.description))).toBe(true);
    expect(uniq(pages.map((p) => strip(p.h1)))).toBe(true);
  });
});

describe("every page", () => {
  for (const p of pages) {
    const doc = html(p);
    const url = `${ctx.origin}${p.slug ? `/${p.slug}/` : "/"}`;
    describe(p.slug || "/", () => {
      it("has exactly one h1 and ordered headings", () => {
        expect(doc.match(/<h1[\s>]/g)?.length).toBe(1);
        const levels = [...doc.matchAll(/<h([1-4])[\s>]/g)].map((m) => Number(m[1]));
        levels.forEach((l, i) => i && expect(l - levels[i - 1], `jump to h${l}`).toBeLessThanOrEqual(1));
      });
      it("has the full social and canonical head", () => {
        if (p.type !== "notfound") expect(doc).toContain(`<link rel="canonical" href="${url}">`);
        expect(meta(doc, "og:url")).toBe(url);
        expect(meta(doc, "twitter:card")).toBe("summary_large_image");
        expect(meta(doc, "og:image")).toBe(`${ctx.origin}/assets/og/${ogName(p.slug)}.png`);
        expect(meta(doc, "og:image:width")).toBe("1200");
        expect(meta(doc, "og:image:height")).toBe("630");
        expect(meta(doc, "og:image:alt")).toBeTruthy();
        expect(existsSync(join(root, "site/assets/og", `${ogName(p.slug)}.png`)), "social card on disk").toBe(true);
      });
      it("has JSON-LD that parses, with the baked version", () => {
        const blocks = [...doc.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
        expect(blocks).toHaveLength(1);
        const data = JSON.parse(blocks[0][1]);
        const types = data["@graph"].map((n: { "@type": string }) => n["@type"]);
        expect(types).toContain("SoftwareApplication");
        const app = data["@graph"].find((n: { "@type": string }) => n["@type"] === "SoftwareApplication");
        expect(app.softwareVersion).toBe(ctx.version);
        if (p.type !== "home") expect(types).toContain("BreadcrumbList");
        if (p.type === "guide") expect(types).toContain("TechArticle");
        // FAQPage only when the FAQ is visible on the page.
        expect(types.includes("FAQPage")).toBe(Boolean(p.faq?.length));
        if (p.faq?.length) for (const f of p.faq) expect(doc).toContain(`<summary>${f.q}</summary>`);
      });
      it("links only to pages and files that exist", () => {
        const known = new Set(pages.map((x) => (x.slug ? `/${x.slug}/` : "/")));
        for (const m of doc.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
          const ref = m[1];
          const ok = known.has(ref) || files.has(ref.slice(1)) || existsSync(join(root, "site", ref));
          expect(ok, ref).toBe(true);
        }
        for (const m of doc.matchAll(/srcset="([^"]+)"/g)) {
          for (const part of m[1].split(",")) {
            const ref = part.trim().split(" ")[0];
            expect(existsSync(join(root, "site", ref)), ref).toBe(true);
          }
        }
      });
      it("gives every image its size and alt text", () => {
        for (const m of doc.matchAll(/<img\b[^>]*>/g)) {
          expect(m[0], m[0]).toMatch(/\balt="/);
          expect(m[0], m[0]).toMatch(/\bwidth="\d+"/);
          expect(m[0], m[0]).toMatch(/\bheight="\d+"/);
        }
      });
    });
  }
});

describe("crawl files", () => {
  const sitemap = files.get("sitemap.xml") as string;
  it("the sitemap lists every indexable page once, with lastmod, and not the 404", () => {
    const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toHaveLength(indexable(pages).length);
    expect(new Set(locs).size).toBe(locs.length);
    expect(sitemap).not.toContain("/404/");
    expect(sitemap.match(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/g)).toHaveLength(locs.length);
  });
  it("robots.txt allows the named AI crawlers and points at the sitemap", () => {
    const robots = files.get("robots.txt") as string;
    for (const ua of ["GPTBot", "ClaudeBot", "Claude-SearchBot", "PerplexityBot", "Google-Extended"]) {
      expect(robots).toContain(`User-agent: ${ua}\nAllow: /`);
    }
    expect(robots).toContain(`Sitemap: ${ctx.origin}/sitemap.xml`);
  });
  it("llms.txt links every non-hub page and avoids the old false claims", () => {
    const llms = files.get("llms.txt") as string;
    for (const p of pages.filter((x) => x.type !== "hub" && x.group !== "project")) {
      expect(llms, p.slug).toContain(`${ctx.origin}/${p.slug}/`);
    }
    expect(llms).not.toMatch(/stores no credentials|never (reads|touches) your OAuth token/i);
  });
  it("the manifest is valid JSON with 192 and 512 icons that exist", () => {
    const m = JSON.parse(files.get("site.webmanifest") as string);
    for (const icon of m.icons) expect(existsSync(join(root, "site", icon.src)), icon.src).toBe(true);
    expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  });
  it("publishes the IndexNow key file", () => {
    const key = ctx.site.indexNowKey;
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(files.get(`${key}.txt`)).toBe(`${key}\n`);
  });
});

describe("copy rules", () => {
  it("never calls downloads users or developers", () => {
    for (const [k, v] of files) expect(v, k).not.toMatch(/\d[\d,]* (developers|users)\b/i);
  });
  it("never repeats the retired privacy claims", () => {
    for (const [k, v] of files) expect(v, k).not.toMatch(/never (reads|touches) your (OAuth )?token|stores no credentials/i);
  });
});
