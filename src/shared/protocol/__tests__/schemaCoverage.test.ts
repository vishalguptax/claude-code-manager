/**
 * Contract guard: every message variant declared in messages.ts must have
 * a valibot schema in schemas.ts.
 *
 * The two files are not checkable against each other by the compiler —
 * messages.ts is types, erased at build time, and schemas.ts is runtime
 * values. A variant added to one and forgotten in the other type-checks
 * perfectly and then fails silently at runtime: dispatch drops inbound
 * messages it cannot parse, and messageBus drops outbound ones, so the
 * symptom is a tab that sits on its loading skeleton forever with nothing
 * in the console.
 *
 * That is exactly how the Prompts, Memory and Plugins tabs shipped broken.
 * Scanning the sources is ugly, but it is the only way to compare a type
 * union against a runtime union, and the failure it catches is invisible
 * by every other means.
 */
import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as path from "path";

const DIR = path.join(__dirname, "..");
const messagesSrc = fs.readFileSync(path.join(DIR, "messages.ts"), "utf8");
const schemasSrc = fs.readFileSync(path.join(DIR, "schemas.ts"), "utf8");

/** Strip block and line comments so commented-out variants are not counted. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Every `type: "x"` literal declared in a union member. */
function declaredVariants(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripComments(src).matchAll(/\btype:\s*"([a-zA-Z][a-zA-Z0-9_]*)"/g)) {
    out.add(m[1]);
  }
  return out;
}

/** Every `v.literal("x")` used as a schema's discriminator. */
function schemaVariants(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripComments(src).matchAll(
    /type:\s*v\.literal\("([a-zA-Z][a-zA-Z0-9_]*)"\)/g,
  )) {
    out.add(m[1]);
  }
  return out;
}

describe("protocol schema coverage", () => {
  const declared = declaredVariants(messagesSrc);
  const schemas = schemaVariants(schemasSrc);

  it("finds variants in both files", () => {
    // Guard the guard: if either regex rots, the comparison below would
    // pass vacuously forever.
    expect(declared.size).toBeGreaterThan(50);
    expect(schemas.size).toBeGreaterThan(50);
  });

  it("has a schema for every declared message variant", () => {
    const missing = [...declared].filter((t) => !schemas.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("declares every schema'd variant in the type union", () => {
    // The other direction: a schema with no type is dead weight, and more
    // often means the type was renamed and the schema left behind.
    const orphaned = [...schemas].filter((t) => !declared.has(t)).sort();
    expect(orphaned).toEqual([]);
  });
});
