/**
 * Integrity checks over every stylesheet.
 *
 * These exist because of a real regression: a scripted edit to account.css
 * anchored on a comment that sat INSIDE a rule body, removed the body, and left
 * `.actions-row {` open. An unclosed brace makes the CSS parser discard every
 * rule after it, so the entire Account tab — quota bars, heatmap, stat tiles —
 * rendered as unstyled stacked text. Nothing caught it: the bundle still built,
 * TypeScript had nothing to say, and 2,231 happy-dom tests passed, because none
 * of them parse CSS or lay anything out.
 *
 * A brace counter would have caught it in under a second.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const STYLES = path.resolve(__dirname, "..");
const FILES = fs.readdirSync(STYLES).filter((f) => f.endsWith(".css"));

/** Strip comments so braces inside prose are not counted as syntax. */
const strip = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, "");

describe("stylesheet integrity", () => {
  it("finds the stylesheets", () => {
    // Guard the guard: a wrong directory would make every check below vacuous.
    expect(FILES.length).toBeGreaterThanOrEqual(15);
  });

  it.each(FILES)("%s has balanced braces", (file) => {
    const css = strip(fs.readFileSync(path.join(STYLES, file), "utf-8"));
    let depth = 0;
    let strayClose = 0;
    for (const ch of css) {
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth < 0) {
          strayClose++;
          depth = 0;
        }
      }
    }
    expect({ file, unclosed: depth, strayClose }).toEqual({
      file,
      unclosed: 0,
      strayClose: 0,
    });
  });

  it.each(FILES)("%s has no empty rule bodies", (file) => {
    // An empty body is what a half-completed deletion leaves behind. It is
    // harmless to the parser, which is exactly why it survives unnoticed.
    const css = strip(fs.readFileSync(path.join(STYLES, file), "utf-8"));
    const empty = [...css.matchAll(/([^{}]+)\{\s*\}/g)].map((m) => m[1].trim().slice(0, 60));
    expect(empty).toEqual([]);
  });

  it.each(FILES)("%s declares no bare hex colour outside tokens.css", (file) => {
    // Colours come from VS Code theme variables; a hex is only ever legitimate
    // as the fallback inside `var(--x, #hex)`.
    if (file === "tokens.css") return;
    const css = strip(fs.readFileSync(path.join(STYLES, file), "utf-8"));
    const withoutFallbacks = css.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, "");
    const bare = [...withoutFallbacks.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
    // `#fff` on a solid danger fill is theme-independent and deliberate.
    expect(bare.filter((c) => c.toLowerCase() !== "#fff")).toEqual([]);
  });

  // A stray comment terminator is the quietest way to break a stylesheet.
  // Braces stay balanced, so the brace guard above passes, but the prose left
  // dangling outside the comment is invalid CSS and the parser discards
  // whatever declaration follows it. That is exactly how --role-selected-bg
  // was lost: an edit closed one comment, ran on in plain text, then closed
  // again, which silently deleted the token and left every selected segment
  // unpainted while the tests stayed green.
  it.each(FILES)("%s has no unbalanced comment markers", (name) => {
    const css = fs.readFileSync(path.join(STYLES, name), "utf-8");
    let i = 0;
    let opens = 0;
    let closes = 0;
    while (i < css.length - 1) {
      if (css[i] === "/" && css[i + 1] === "*") {
        opens++;
        const end = css.indexOf("*/", i + 2);
        if (end === -1) break;
        closes++;
        i = end + 2;
        continue;
      }
      // A `*/` reached OUTSIDE a comment is the bug: it means an earlier
      // comment already closed and this one terminates nothing.
      if (css[i] === "*" && css[i + 1] === "/") {
        const line = css.slice(0, i).split("\n").length;
        throw new Error(`${name}: stray "*/" outside a comment at line ${line}`);
      }
      i++;
    }
    expect(opens).toBe(closes);
  });
});

/**
 * Row action buttons are hidden by default and revealed by an explicit list
 * of row-class selectors. That list is easy to extend a tab without, and the
 * failure is silent: the button renders, occupies no visible state, and is
 * simply never seen. That is exactly what happened to the Plugins tab —
 * every row's copy button was invisible from the day it shipped.
 *
 * `.list-item` in the reveal list is what makes the rule general: every row
 * built on the shared <ListItem> carries it, so a new tab is covered on
 * arrival rather than when someone notices.
 */
describe("row action reveal", () => {
  const components = fs.readFileSync(path.join(STYLES, "components.css"), "utf8");

  it("reveals on hover and focus for any shared list row", () => {
    const body = strip(components);
    for (const selector of [
      ".list-item:hover .item-copy-btn",
      ".list-item:hover .item-chat-btn",
      ".list-item:focus-within .item-copy-btn",
      ".list-item:focus-within .item-chat-btn",
    ]) {
      expect(body).toContain(selector);
    }
  });

  it("keeps the buttons hidden by default", () => {
    // If this ever stops being true the reveal rule is pointless, and the
    // buttons would be permanently lit on every row instead.
    expect(strip(components)).toMatch(/\.item-copy-btn,\s*\n\.item-chat-btn \{\s*opacity: 0;/);
  });

  it("is not re-declared by any feature stylesheet", () => {
    // One owner per selector (CLAUDE.md). A feature patching its own reveal
    // is the symptom of the shared list having missed it.
    const offenders = FILES.filter((f) => f !== "components.css").filter((f) =>
      /:hover\s+\.item-copy-btn|:focus-within\s+\.item-copy-btn/.test(
        strip(fs.readFileSync(path.join(STYLES, f), "utf8")),
      ),
    );
    expect(offenders).toEqual([]);
  });
});

/**
 * `outline` and `icon-outline` are the same control drawn with and without a
 * label, and every use puts them side by side — collapse beside "Select",
 * refresh beside the search field, continue beside "New Session". They have
 * to read as one family.
 *
 * They drifted because `icon-outline` inherited its colour from `.btn-icon`,
 * which deliberately uses `icon.foreground` so a LONE toolbar glyph matches
 * the ones VS Code draws beside it. Correct in isolation, wrong when paired:
 * the collapse chevrons sat at a visibly different shade from the "Select"
 * label 8px away.
 */
describe("outline button family", () => {
  const native = strip(fs.readFileSync(path.join(STYLES, "components-native.css"), "utf8"));

  /** Declarations inside the first rule whose selector list matches. */
  const ruleBody = (selector: string): string => {
    const at = native.indexOf(`${selector} {`);
    expect(at).toBeGreaterThan(-1);
    return native.slice(at, native.indexOf("}", at));
  };

  it("draws both variants in the same resting colour", () => {
    expect(ruleBody(".btn-outline")).toContain("color: var(--fg-muted)");
    expect(ruleBody(".btn-icon-outline")).toContain("color: var(--fg-muted)");
  });

  it("lights both up identically on hover", () => {
    const text = ruleBody(".btn-outline:hover:not(:disabled)");
    const icon = ruleBody(".btn-icon-outline:hover:not(:disabled)");
    for (const decl of ["color: var(--fg)", "border-color: var(--accent)"]) {
      expect(text).toContain(decl);
      expect(icon).toContain(decl);
    }
  });

  it("gives the icon variant no ghost fill its labelled twin lacks", () => {
    // .btn-icon:hover paints a ghost background; inheriting it here would
    // make one of the pair fill on hover while the other only changes edge.
    expect(ruleBody(".btn-icon-outline:hover:not(:disabled)")).toContain(
      "background: transparent",
    );
  });
});
