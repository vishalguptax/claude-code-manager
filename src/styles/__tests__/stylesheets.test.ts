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
});
