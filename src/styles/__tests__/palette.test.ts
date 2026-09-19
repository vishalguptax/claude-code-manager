/**
 * Contract tests for the colour layer.
 *
 * Three failures shipped here, none of which any existing test could see,
 * because a colour that is merely *hard to read* parses, builds and renders
 * exactly like one that is not:
 *
 *  1. A `--fg-muted` level wired to `--vscode-disabledForeground` — the
 *     lowest-contrast colour a theme ships — carried ~80 call sites that were
 *     not disabled at all (row copy/chat buttons, collapse chevrons, palette
 *     icons, meta lines). On themes that take disabledForeground near 2:1 the
 *     sidebar's glyphs were barely visible. The level is gone; those call
 *     sites are quiet text and sit on `--fg-dim`.
 *  2. The hardcoded status hues were GitHub Primer's DARK scale only. On a
 *     light theme #58a6ff measures 2.2:1 and #3fb950 2.3:1 against white, so
 *     the MCP type chips, plan badge, agent scope icons and running-session
 *     dot washed out.
 *  3. Several rules dimmed the already-quiet foreground a second time with
 *     `opacity`, multiplying two reductions that were each designed to be the
 *     only one.
 *
 * The numeric checks below are the part a reviewer cannot do by eye. The sync
 * check is the part nobody remembered to do at all: tokens.css says "keep the
 * two in sync" with the inline <style> in html.ts, and until now nothing made
 * that true.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const tokensCss = fs.readFileSync(path.join(ROOT, "src", "styles", "tokens.css"), "utf-8");
const htmlTs = fs.readFileSync(path.join(ROOT, "src", "extension", "html.ts"), "utf-8");

const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

/** The surfaces each half of the palette has to survive. */
const DARK_BG = "#1f1f1f"; // VS Code Dark Modern sideBar.background
const LIGHT_BG = "#ffffff"; // VS Code Light Modern sideBar.background

/**
 * Foreground hues carried as raw hex rather than a --vscode-* variable. These
 * are the only colours in the extension whose readability is ours to get
 * right; every other token inherits a value the theme author already tuned.
 *
 * Named explicitly rather than scraped, so that adding a hue to tokens.css
 * without deciding its light-mode partner fails the "has a light counterpart"
 * test below instead of silently escaping this list.
 */
const SEMANTIC_FG = ["--green", "--color-blue", "--color-purple", "--color-amber", "--orange", "--red"];

// ── contrast ────────────────────────────────────────────────────────────────

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1:1 (identical) to 21:1 (black on white). */
function contrast(fg: string, bg: string): number {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}

// ── token extraction ────────────────────────────────────────────────────────

/** Declarations inside the first `:root { … }` block of a stylesheet. */
function rootBlock(css: string): string {
  const start = css.indexOf(":root");
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

/** Declarations inside the `body.vscode-light, …` override block. */
function lightBlock(css: string): string {
  const start = css.indexOf("body.vscode-light");
  expect(start).toBeGreaterThan(-1);
  const open = css.indexOf("{", start);
  return css.slice(open + 1, css.indexOf("}", open));
}

function declarations(block: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.set(m[1], m[2].replace(/\s+/g, " ").trim());
  }
  return out;
}

/**
 * The hex a token paints with: either the whole value, or the fallback inside
 * `var(--theme-colour, #hex)` — the branch a theme that leaves the colour
 * unset actually lands on, and therefore the one worth measuring.
 */
function hexOf(value: string): string | undefined {
  return value.match(/#[0-9a-f]{3,8}\b/i)?.[0];
}

const darkTokens = declarations(rootBlock(strip(tokensCss)));
const lightTokens = declarations(lightBlock(strip(tokensCss)));

// ── tests ───────────────────────────────────────────────────────────────────

describe("text levels", () => {
  /**
   * Three levels, each one a VS Code variable: body, quiet, disabled. The bug
   * was a fourth — `--fg-muted`, wired to disabledForeground and used at eighty
   * call sites that were not disabled — and the lesson is that a level with no
   * variable behind it has to invent a colour the theme never chose.
   */
  it("has exactly the levels VS Code gives colours for", () => {
    expect([...darkTokens.keys()].filter((k) => /^--fg(-|$)/.test(k)).sort()).toEqual([
      "--fg",
      "--fg-dim",
      "--fg-disabled",
      "--fg-section",
    ]);
  });

  it("spends disabledForeground on disabled controls and nothing else", () => {
    const misuse = [...darkTokens.entries()]
      .filter(([k, v]) => v.includes("disabledForeground") && k !== "--fg-disabled")
      .map(([k]) => k);
    expect(misuse).toEqual([]);
  });

  it("takes each level straight from its theme variable", () => {
    // Deriving one — mixing, tinting, fading — is second-guessing the theme
    // author, and makes the panel disagree with the editor around it. Whatever
    // VS Code renders description text at, so do we.
    expect(darkTokens.get("--fg-dim")).toBe("var(--vscode-descriptionForeground)");
    expect(darkTokens.get("--fg-disabled")).toBe("var(--vscode-disabledForeground)");
  });
});

describe("theme-owned colours are not second-guessed", () => {
  /**
   * A theme's own colour is used as shipped. Dracula's placeholder is 3.36:1;
   * so is every other placeholder Dracula renders, and matching it is what
   * keeps this panel looking like part of the editor rather than a page that
   * disagrees with it.
   *
   * Borrowing the WRONG variable is the bug worth guarding. This tab strip is
   * sidebar chrome, and it used to colour itself with panelTitle.*, which
   * themes tune for the panel's title row against panel.background — Dracula
   * puts #6272A4 there, and the strip's icons came out barely-there purple.
   */
  const tabs = strip(fs.readFileSync(path.join(ROOT, "src", "styles", "tabs.css"), "utf-8"));

  it("colours the sidebar tab strip with sidebar text colours", () => {
    expect(tabs).not.toContain("panelTitle-inactiveForeground");
    expect(tabs).not.toContain("panelTitle-activeForeground");
  });

  it("leaves the placeholder colour to the theme", () => {
    const native = strip(
      fs.readFileSync(path.join(ROOT, "src", "styles", "components-native.css"), "utf-8"),
    );
    for (const m of native.matchAll(/::placeholder\s*\{([^}]*)\}/g)) {
      expect(m[1]).toContain("--vscode-input-placeholderForeground");
    }
  });
});

describe("semantic palette covers both theme polarities", () => {
  it.each(SEMANTIC_FG)("%s has a light-surface counterpart", (token) => {
    expect(darkTokens.has(token)).toBe(true);
    expect(lightTokens.has(token)).toBe(true);
  });

  it.each(SEMANTIC_FG)("%s clears AA on a dark sidebar", (token) => {
    const hex = hexOf(darkTokens.get(token) ?? "");
    expect(hex, `${token} declares no hex`).toBeDefined();
    expect({ token, ratio: +contrast(hex!, DARK_BG).toFixed(2) }).toEqual({
      token,
      ratio: expect.any(Number),
    });
    expect(contrast(hex!, DARK_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SEMANTIC_FG)("%s clears AA on a light sidebar", (token) => {
    const hex = hexOf(lightTokens.get(token) ?? "");
    expect(hex, `${token} declares no hex`).toBeDefined();
    expect(contrast(hex!, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("derives every tint background from its hue instead of repeating it", () => {
    // A second hardcoded rgba() is how the light themes ended up with a wash
    // of the dark hue under text that had already moved to the light one.
    for (const token of SEMANTIC_FG) {
      const bg = darkTokens.get(`${token}-bg`) ?? darkTokens.get(`${token.replace("--color-", "--")}-bg`);
      if (!bg) continue;
      expect({ token, bg }).toEqual({ token, bg: expect.stringContaining("color-mix") });
    }
  });
});

describe("no rule dims the quiet foreground twice", () => {
  /**
   * `--fg-dim` is already the theme's reduced step. A rule that also sets
   * `opacity` multiplies the two, and the product is what made row buttons
   * and meta text unreadable on light themes.
   *
   * Opacity is still legitimate for state — a disabled hook, a pruned
   * checkpoint version, a plugin that is not loading — so the guard is scoped
   * to blocks that set BOTH in the same body, which is where the accident
   * happens.
   */
  const FILES = fs
    .readdirSync(path.join(ROOT, "src", "styles"))
    .filter((f) => f.endsWith(".css"));

  it.each(FILES)("%s", (file) => {
    const css = strip(fs.readFileSync(path.join(ROOT, "src", "styles", file), "utf-8"));
    const offenders: string[] = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const [, selector, body] = m;
      if (!/color:\s*var\(--fg-dim/.test(body)) continue;
      const opacity = body.match(/(?:^|[;\s])opacity:\s*([\d.]+)/);
      if (opacity && Number(opacity[1]) < 1) {
        offenders.push(`${selector.trim().slice(0, 60)} (opacity ${opacity[1]})`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe("no colour escapes the token layer", () => {
  /**
   * stylesheets.test.ts already bans a bare `#hex` outside tokens.css. It does
   * not ban `rgb()` / `rgba()`, and that gap is not theoretical: the MCP and
   * Account re-auth banners hardcoded `rgb(245, 158, 11)` six times across two
   * files — a seventh status hue that reached no token, and therefore never
   * got the light-theme half the other six now have. Its glyph measured 2.1:1
   * on white.
   *
   * Neutral and black/white alphas stay legal: a scrim is black by intent and
   * a grey hairline reads correctly on either polarity. It is the SATURATED
   * literal — a hue with an opinion — that belongs in tokens.css, where the
   * polarity split can reach it.
   *
   * The carve-out is the same one stylesheets.test.ts grants a hex: inside
   * `var(--theme-colour, …)` a literal is the branch a theme that leaves the
   * colour unset falls to, not a colour choice of ours. `--vscode-editor-
   * findMatchHighlightBackground`'s yellow is a highlighter pen on either
   * polarity; the banner's orange was a decision, declared outright.
   */
  const FILES = fs
    .readdirSync(path.join(ROOT, "src", "styles"))
    .filter((f) => f.endsWith(".css") && f !== "tokens.css");

  /** Drop `var(…)` calls, nested ones included, leaving only direct values. */
  const withoutFallbacks = (css: string): string =>
    css.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");

  it.each(FILES)("%s declares no saturated rgb()/rgba() literal", (file) => {
    const css = withoutFallbacks(strip(fs.readFileSync(path.join(ROOT, "src", "styles", file), "utf-8")));
    const saturated: string[] = [];
    for (const m of css.matchAll(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/g)) {
      const [r, g, b] = m.slice(1, 4).map(Number);
      // Spread between the channels is what makes a colour a hue rather than
      // a grey. 24/255 leaves the neutral hairlines (127,127,127) and scrims
      // (0,0,0) alone while catching anything with a cast.
      if (Math.max(r, g, b) - Math.min(r, g, b) > 24) saturated.push(m[0] + ")");
    }
    expect(saturated).toEqual([]);
  });

  it("keeps every inline hex fallback in step with the token it falls back to", () => {
    // `var(--green, #2ea043)` outlived the move to #3fb950 and would have
    // painted the retired, sub-AA hue on any theme that left the var unset.
    const all = FILES.concat("tokens.css")
      .map((f) => fs.readFileSync(path.join(ROOT, "src", "styles", f), "utf-8"))
      .join("\n");
    const stale: string[] = [];
    for (const m of strip(all).matchAll(/var\(\s*(--[a-z0-9-]+)\s*,\s*(#[0-9a-f]{3,8})\s*\)/gi)) {
      const [, token, fallback] = m;
      const declared = hexOf(darkTokens.get(token) ?? "");
      if (declared && declared.toLowerCase() !== fallback.toLowerCase()) {
        stale.push(`${token} falls back to ${fallback}, declared ${declared}`);
      }
    }
    expect(stale).toEqual([]);
  });
});

describe("the pre-paint shell agrees with the stylesheet", () => {
  /**
   * html.ts inlines a subset of these tokens so the panel paints before
   * styles.css loads. Two copies of a value is a fact about the CSP shell, not
   * a choice — but a drift between them shows up as a flash of the wrong
   * colour on every panel open, which is exactly the kind of thing nobody
   * files a bug for.
   */
  const inlineStyle = htmlTs.slice(htmlTs.indexOf("<style>"), htmlTs.indexOf("</style>"));
  const shellRoot = declarations(rootBlock(inlineStyle));
  const shellLight = declarations(lightBlock(inlineStyle));

  it("inlines a meaningful subset, not an empty one", () => {
    expect(shellRoot.size).toBeGreaterThan(20);
  });

  it.each([...SEMANTIC_FG, "--fg-dim", "--fg-disabled"])("%s matches in both copies", (token) => {
    expect(shellRoot.has(token), `${token} missing from the html.ts shell`).toBe(true);
    expect({ token, value: shellRoot.get(token) }).toEqual({ token, value: darkTokens.get(token) });
  });

  it.each(SEMANTIC_FG)("%s matches in both light-mode copies", (token) => {
    expect({ token, value: shellLight.get(token) }).toEqual({ token, value: lightTokens.get(token) });
  });

  it("does not inline a token the stylesheet has since dropped", () => {
    const orphans = [...shellRoot.keys()].filter((k) => !darkTokens.has(k));
    expect(orphans).toEqual([]);
  });
});
