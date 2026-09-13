/**
 * Contract tests for the `claudeManager.density` setting.
 *
 * Density is the one piece of styling whose correctness cannot be seen from
 * any single file: the setting is declared in package.json, pushed by the host,
 * normalised in globalSignals, stamped by App, and consumed by density.css,
 * which has to override rules that live in five other stylesheets and be
 * concatenated after all of them. A break anywhere in that chain is silent —
 * the attribute simply matches nothing and the panel renders comfortable.
 *
 * These tests pin the two links a normal unit test cannot reach: the CSS build
 * order, and the requirement that every list row in the extension has a quiet
 * variant. The rest of the chain is covered by globalSignals, App and
 * viewProvider suites.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const STYLES = path.join(ROOT, "src", "styles");

const buildScript = fs.readFileSync(path.join(ROOT, "scripts", "build-css.js"), "utf-8");
const densityCss = fs.readFileSync(path.join(STYLES, "density.css"), "utf-8");

/**
 * Drop CSS comments before parsing. These stylesheets are heavily commented
 * and a comment sits immediately above almost every rule, so without this the
 * "selector" captured for a block is the preceding comment plus the selector.
 */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

interface Rule {
  selectors: string;
  body: string;
}

/**
 * Split a stylesheet into its rule blocks.
 *
 * This tracks brace depth rather than pattern-matching `{...}`, because a flat
 * regex desynchronises on the first nested block: `@keyframes live-pulse` in
 * sessions.css closes an inner `0% { }` before the outer one, after which every
 * subsequent "selector" is offset by a brace and real rules go unseen.
 *
 * Conditional groups (`@media`, `@supports`) are recursed into so a row rule
 * hidden inside one is still found; other at-rules (`@keyframes`) are skipped,
 * since their inner blocks are keyframe stops, not selectors.
 */
function parseRules(css: string): Rule[] {
  const out: Rule[] = [];
  let depth = 0;
  let selectorStart = 0;
  let bodyStart = 0;
  let selectors = "";
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) {
        selectors = css.slice(selectorStart, i).trim();
        bodyStart = i + 1;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        const body = css.slice(bodyStart, i);
        if (/^@(media|supports)\b/.test(selectors)) {
          out.push(...parseRules(body));
        } else if (!selectors.startsWith("@")) {
          out.push({ selectors, body });
        }
        selectorStart = i + 1;
      }
    }
  }
  return out;
}

/** The ordered file list build-css.js concatenates. */
function buildOrder(): string[] {
  const block = buildScript.slice(
    buildScript.indexOf("const FILES = ["),
    buildScript.indexOf("];", buildScript.indexOf("const FILES = [")),
  );
  return [...block.matchAll(/"([\w.-]+\.css)"/g)].map((m) => m[1]);
}

/**
 * Every row class that declares a bottom border in a feature stylesheet — i.e.
 * every list row ruled off from the next one, which therefore needs a quiet
 * counterpart. Row classes are `.item` or `.<feature>-item`, the convention
 * every list feature already follows (`.item`, `.cmd-item`, `.hook-item`,
 * `.mcp-item`, `.agent-item`). Region dividers such as `.list-header` and
 * `.d-msg-header` are deliberately outside that shape: they separate surfaces,
 * not sibling rows, and stay in both densities.
 */
function ruledRowClasses(): Set<string> {
  const found = new Set<string>();
  for (const file of buildOrder()) {
    if (file === "density.css") continue;
    const css = stripComments(fs.readFileSync(path.join(STYLES, file), "utf-8"));
    for (const rule of parseRules(css)) {
      if (!/border-bottom:\s*1px/.test(rule.body)) continue;
      for (const sel of rule.selectors.split(",")) {
        // Bare class selector only — skip `:last-child` resets, descendant
        // selectors and anything with state, which are not the row rule.
        // `.item` (sessions) or `.<feature>-item`. The optional prefix must
        // be present-or-absent as a whole, or `.item` itself never matches.
        const m = /^\.((?:[a-z][a-z0-9-]*-)?item)$/.exec(sel.trim());
        if (m) found.add(`.${m[1]}`);
      }
    }
  }
  return found;
}

/** Bare class selectors density.css turns the border off for. */
function quietedRowClasses(): Set<string> {
  const found = new Set<string>();
  for (const match of stripComments(densityCss).matchAll(
    /\[data-density="quiet"\]\s+(\.[a-z][a-z0-9-]*)/g,
  )) {
    found.add(match[1]);
  }
  return found;
}

describe("density.css", () => {
  it("is registered in the CSS build", () => {
    expect(buildOrder()).toContain("density.css");
  });

  // The overrides win on source order, not on specificity or !important. A
  // file inserted after it would silently take back every row rule.
  it("is concatenated last, after every feature stylesheet", () => {
    const order = buildOrder();
    expect(order[order.length - 1]).toBe("density.css");
  });

  it("only declares rules under the quiet attribute", () => {
    // Comfortable is the default and must add nothing: it IS what the feature
    // stylesheets already declare. A stray unscoped rule here would apply to
    // both densities and make the setting look broken in one direction.
    const rules = parseRules(stripComments(densityCss));
    expect(rules.length).toBeGreaterThan(0);
    for (const rule of rules) {
      expect(rule.selectors).toContain('[data-density="quiet"]');
    }
  });

  // The contract a new list feature is most likely to miss. Adding a row class
  // with a bottom border and forgetting density.css leaves that one tab ruled
  // while every other tab is quiet, which reads as a rendering bug.
  it("has a quiet override for every ruled list row in the extension", () => {
    const ruled = ruledRowClasses();
    const quieted = quietedRowClasses();
    // Guard the guard: if the scan finds nothing, the regex has rotted and
    // this test would pass vacuously forever.
    expect(ruled.size).toBeGreaterThanOrEqual(5);
    const missing = [...ruled].filter((c) => !quieted.has(c)).sort();
    expect(missing).toEqual([]);
  });

  // The reverse: a selector here that no longer exists anywhere is dead CSS
  // shipped to every user.
  it("has no overrides for rows that no longer exist", () => {
    const ruled = ruledRowClasses();
    const stale = [...quietedRowClasses()].filter((c) => !ruled.has(c)).sort();
    expect(stale).toEqual([]);
  });
});

describe("claudeManager.density setting", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8")) as {
    contributes: { configuration: { properties: Record<string, { default: string; enum: string[] }> } };
  };
  const setting = pkg.contributes.configuration.properties["claudeManager.density"];

  it("is declared with both densities", () => {
    expect(setting).toBeDefined();
    expect(setting.enum).toEqual(["comfortable", "quiet"]);
  });

  // The webview signal starts at "comfortable" so the first paint is not a
  // flash of the wrong density while the host handshake is in flight. That
  // only holds while the setting's own default agrees.
  it("defaults to comfortable, matching the webview signal default", () => {
    expect(setting.default).toBe("comfortable");
  });

  // Every value the setting can hold must be a value density.css or the
  // comfortable baseline actually handles.
  it("declares no density the stylesheet cannot render", () => {
    const quietRules = densityCss.includes('[data-density="quiet"]');
    expect(setting.enum).toContain("comfortable");
    expect(quietRules).toBe(true);
  });
});
