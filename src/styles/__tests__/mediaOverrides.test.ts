/**
 * Guard against dead `@media` overrides.
 *
 * A responsive rule and the base rule it overrides usually share the same
 * selector, so they tie on specificity and source order alone decides the
 * winner. Declare the media block first and it silently loses — the stylesheet
 * still parses, every unit test still passes, and the breakage only shows up
 * as pixels on someone's screen.
 *
 * That is exactly what shipped in tabs.css: `@media (max-width: 360px)` set
 * `.tab-btn.active { width: 30px }` and `.tab-btn.active .tab-label {
 * display: none }`, but a later unconditional `.tab-btn.active .tab-label {
 * display: inline }` outranked the second half. The active tab shrank to an
 * icon cell and went on painting its label, which — `white-space: nowrap`,
 * nothing clipping it — ran straight across the tab beside it.
 *
 * The check runs over the concatenated bundle in build order, not per file,
 * because the shadowing rule is just as likely to live in a stylesheet that
 * loads later as in the same one.
 */
import * as fs from "fs";
import * as path from "path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..", "..");
const STYLES = path.join(ROOT, "src", "styles");

/** Read the load order from the build script so the two cannot drift apart. */
function buildOrder(): string[] {
  const script = fs.readFileSync(path.join(ROOT, "scripts", "build-css.js"), "utf-8");
  const block = script.match(/const FILES = \[([\s\S]*?)\];/);
  if (!block) throw new Error("could not find the FILES list in scripts/build-css.js");
  return [...block[1].matchAll(/"([^"]+\.css)"/g)].map((m) => m[1]);
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

function normalise(selector: string): string {
  return selector.trim().replace(/\s+/g, " ");
}

interface Declaration {
  selector: string;
  property: string;
  /** Offset in the bundle, used purely to compare source order. */
  at: number;
}

/** Longhands a shorthand also sets, so `padding: 0` is seen to beat `padding-left`. */
const SHORTHAND_EXPANDS: Record<string, string[]> = {
  padding: ["padding-top", "padding-right", "padding-bottom", "padding-left"],
  margin: ["margin-top", "margin-right", "margin-bottom", "margin-left"],
  inset: ["top", "right", "bottom", "left"],
  overflow: ["overflow-x", "overflow-y"],
};

function propertiesOf(body: string): string[] {
  const props: string[] = [];
  for (const part of body.split(";")) {
    const colon = part.indexOf(":");
    if (colon === -1) continue;
    const prop = part.slice(0, colon).trim().toLowerCase();
    // Custom properties cascade the same way, but a token redefined per theme
    // or per breakpoint is the normal idiom rather than a mistake.
    if (!prop || prop.startsWith("--") || /[{}]/.test(prop)) continue;
    props.push(prop, ...(SHORTHAND_EXPANDS[prop] ?? []));
  }
  return props;
}

/**
 * Walk the bundle, collecting every declaration and whether it sits inside a
 * conditional group. Brace depth is tracked rather than matched by regex, so
 * `@keyframes` inner stops do not desynchronise the scan.
 */
function collect(css: string): { conditional: Declaration[]; plain: Declaration[] } {
  const conditional: Declaration[] = [];
  const plain: Declaration[] = [];

  function walk(text: string, offset: number, insideCondition: boolean): void {
    let depth = 0;
    let selectorStart = 0;
    let bodyStart = 0;
    let selectors = "";
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (ch === "{") {
        if (depth === 0) {
          selectors = text.slice(selectorStart, i).trim();
          bodyStart = i + 1;
        }
        depth++;
      } else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const body = text.slice(bodyStart, i);
          if (/^@(media|supports|container)\b/.test(selectors)) {
            walk(body, offset + bodyStart, true);
          } else if (!selectors.startsWith("@")) {
            const sink = insideCondition ? conditional : plain;
            // A conditional rule is dead only once the LAST thing that could
            // shadow it is past, so conditional rules are stamped with the end
            // of their group; plain rules with their own position.
            const at = insideCondition ? offset + text.length : offset + selectorStart;
            for (const selector of selectors.split(",")) {
              const one = normalise(selector);
              if (!one) continue;
              for (const property of propertiesOf(body)) {
                sink.push({ selector: one, property, at });
              }
            }
          }
          selectorStart = i + 1;
        }
      }
    }
  }

  walk(css, 0, false);
  return { conditional, plain };
}

describe("responsive overrides survive the cascade", () => {
  const bundle = buildOrder()
    .map((name) => stripComments(fs.readFileSync(path.join(STYLES, name), "utf-8")))
    .join("\n");

  it("never shadows a @media rule with an identical selector declared later", () => {
    const { conditional, plain } = collect(bundle);

    // Identical selectors only. Same selector means same specificity, so source
    // order is the whole decision and a later declaration always wins — no
    // specificity arithmetic, and so no false positives.
    const laterPlain = new Map<string, number>();
    for (const d of plain) {
      const key = `${d.selector}|${d.property}`;
      const seen = laterPlain.get(key);
      if (seen === undefined || d.at > seen) laterPlain.set(key, d.at);
    }

    const dead = conditional
      .filter((d) => {
        const shadow = laterPlain.get(`${d.selector}|${d.property}`);
        return shadow !== undefined && shadow > d.at;
      })
      .map((d) => `${d.selector} { ${d.property} }`);

    expect([...new Set(dead)]).toEqual([]);
  });
});
