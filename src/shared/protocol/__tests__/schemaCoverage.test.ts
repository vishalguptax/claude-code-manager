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

  it("declares every field of a variant that both files describe", () => {
    // Variant-level coverage was not enough. valibot's `object` STRIPS
    // undeclared keys rather than rejecting them, and messageBus
    // dispatches the parsed value — so a field present in the type and
    // absent from the schema disappears in transit with no error. That
    // is how `archived` and `readAt` never reached the webview, leaving
    // the archive empty and every session marked unread.
    const typeFields = fieldsByVariant(messagesSrc, /\btype:\s*"([a-zA-Z][\w]*)"/);
    const schemaFields = schemaFieldsByVariant(schemasSrc);

    const missing: string[] = [];
    for (const [variant, fields] of schemaFields) {
      const declared = typeFields.get(variant);
      if (!declared) continue;
      for (const f of declared) {
        if (!fields.has(f)) missing.push(`${variant}.${f}`);
      }
    }
    expect(missing.sort()).toEqual([]);
  });

  it("declares every schema'd variant in the type union", () => {
    // The other direction: a schema with no type is dead weight, and more
    // often means the type was renamed and the schema left behind.
    const orphaned = [...schemas].filter((t) => !declared.has(t)).sort();
    expect(orphaned).toEqual([]);
  });
});

/**
 * Field names declared on each variant of the TYPE union, keyed by its
 * `type` literal. Only the single-brace object literal that opens with
 * `type: "x"` is read, which is the shape every variant in messages.ts
 * uses; anything nested is left alone rather than guessed at.
 */
function fieldsByVariant(src: string, typeRe: RegExp): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const body = stripComments(src);
  for (const m of body.matchAll(/\{([^{}]*?)\}/g)) {
    const inner = m[1];
    const tag = typeRe.exec(inner);
    if (!tag) continue;
    const fields = new Set<string>();
    for (const f of inner.matchAll(/(?:^|[;{\n])\s*([a-zA-Z][\w]*)\??:/g)) {
      if (f[1] !== "type") fields.add(f[1]);
    }
    const existing = out.get(tag[1]);
    if (existing) for (const f of fields) existing.add(f);
    else out.set(tag[1], fields);
  }
  return out;
}

/**
 * Field names declared on each `v.object({ type: v.literal("x"), … })`.
 *
 * Handles the two shapes schemas.ts legitimately uses beyond plain
 * `key: value`: property shorthand (`scope`) and spreads of a shared
 * field group (`...checkpointTarget`). Missing either produced false
 * positives that would have trained people to ignore this test.
 */
function schemaFieldsByVariant(src: string): Map<string, Set<string>> {
  const body = stripComments(src);

  // Reusable field groups that get spread into schemas.
  const fragments = new Map<string, Set<string>>();
  for (const m of body.matchAll(/const\s+([a-zA-Z][\w]*)\s*=\s*\{([^{}]*)\}\s*;/g)) {
    const keys = new Set<string>();
    for (const k of m[2].matchAll(/(?:^|[,\n])\s*([a-zA-Z][\w]*)\s*[,:]/g)) keys.add(k[1]);
    if (keys.size > 0) fragments.set(m[1], keys);
  }

  const keysOf = (inner: string): Set<string> => {
    const fields = new Set<string>();
    // Terminators cover `key:`, shorthand `key,`, and a trailing
    // shorthand that closes the literal (`scope })`).
    for (const x of inner.matchAll(/(?:^|[,\n])\s*([a-zA-Z][\w]*)\s*(?=[,:\n}]|$)/g)) {
      if (x[1] !== "type") fields.add(x[1]);
    }
    for (const sp of inner.matchAll(/\.\.\.([a-zA-Z][\w]*)/g)) {
      for (const k of fragments.get(sp[1]) ?? []) if (k !== "type") fields.add(k);
    }
    return fields;
  };

  const out = new Map<string, Set<string>>();
  // Single-line declarations first: the multi-line pattern below would
  // run past one of these and swallow the next declaration's fields.
  for (const m of body.matchAll(/v\.object\(\{([^\n]*?)\}\)/g)) {
    const tag = /type:\s*v\.literal\("([a-zA-Z][\w]*)"\)/.exec(m[1]);
    if (tag) out.set(tag[1], keysOf(m[1]));
  }
  for (const m of body.matchAll(/v\.object\(\{([\s\S]*?)\n\}\)/g)) {
    const tag = /type:\s*v\.literal\("([a-zA-Z][\w]*)"\)/.exec(m[1]);
    if (tag && !out.has(tag[1])) out.set(tag[1], keysOf(m[1]));
  }
  return out;
}
