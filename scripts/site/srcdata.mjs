// Reads the two lists the site publishes straight from the extension's source,
// so /commands/ and /hooks/ always match what the shipped sidebar knows:
//   - BUILTIN_COMMANDS in src/features/commands/parser.ts ([name, description] tuples)
//   - KNOWN_HOOK_EVENTS in src/features/hooks/events.ts ({ name, label, description })
// Parsed as text (the build has no TypeScript toolchain). A parse that finds
// nothing throws: an empty list on a live page is worse than a failed build.

function block(source, marker) {
  const start = source.indexOf(marker);
  if (start < 0) throw new Error(`srcdata: ${marker} not found`);
  const end = source.indexOf("];", start);
  return source.slice(start, end);
}

/** [{ name: "/add-dir", description }] in source order. */
export function readBuiltinCommands(source) {
  const body = block(source, "const BUILTIN_COMMANDS");
  const out = [...body.matchAll(/\[\s*"([^"]+)",\s*"([^"]*)"\s*\]/g)].map((m) => ({
    name: `/${m[1]}`,
    description: m[2],
  }));
  if (!out.length) throw new Error("srcdata: no built-in commands parsed");
  return out;
}

/** [{ name: "SessionStart", description }] in source order. */
export function readHookEvents(source) {
  const body = block(source, "export const KNOWN_HOOK_EVENTS");
  const out = [
    ...body.matchAll(/name:\s*"([^"]+)",\s*label:\s*"[^"]*",\s*description:\s*"([^"]*)"/g),
  ].map((m) => ({ name: m[1], description: m[2] }));
  if (!out.length) throw new Error("srcdata: no hook events parsed");
  return out;
}
