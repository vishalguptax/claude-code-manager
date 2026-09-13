/**
 * A readable name for a hook row.
 *
 * Hooks have no `name` field — settings.json stores an event, an optional
 * matcher, and a command — so the rows led with a bare scope chip and a file
 * path. Every other tab in the extension leads with a name, and scanning a
 * list of paths for the one you want is markedly harder than scanning a list
 * of names.
 *
 * The command is the only thing that carries intent, so the name comes out of
 * it, most specific first:
 *
 *   1. The script's own filename, for the common `path/to/guard-push.sh` case.
 *      Hyphens and underscores become spaces because that is how the author
 *      wrote the sentence before the filesystem made them pick a separator.
 *   2. The first real word of an inline command (`pnpm`, `echo`, `npx`), with
 *      its subcommand when it has one — `pnpm exec prettier` says more than
 *      `pnpm`.
 *   3. The command verbatim, when it is short enough to be its own name.
 *
 * This is a DISPLAY name, derived fresh on render. Nothing is written back to
 * settings.json: the file belongs to the user and to Claude Code, and a name
 * we invented has no business in it.
 */

/** Shell noise that tells you nothing about what the hook does. */
const WRAPPERS = new Set(["sh", "bash", "zsh", "node", "npx", "pnpm", "npm", "yarn", "exec", "env"]);

/** Strip a leading env-var assignment, e.g. `FOO=1 ./run.sh`. */
const ENV_ASSIGN = /^[A-Z_][A-Z0-9_]*=\S*$/;

/** Does this token look like a path to a script? */
function isScriptPath(token: string): boolean {
  return /\.(sh|bash|zsh|js|mjs|cjs|ts|py|rb)$/.test(token);
}

/** Filename without directories or extension, separators turned back to spaces. */
function scriptName(token: string): string {
  const base = token.split("/").pop() ?? token;
  return base.replace(/\.[^.]+$/, "").replace(/[-_.]+/g, " ").trim();
}

/**
 * Build the display name. Returns an empty string only when the command is
 * empty, in which case the caller should fall back to the event label rather
 * than render a blank row.
 */
export function hookTitle(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return "";

  const tokens = trimmed.split(/\s+/).filter((t) => !ENV_ASSIGN.test(t));

  // A script path anywhere in the command names it better than any prefix:
  // `pnpm exec node ./scripts/guard-push.sh` is "guard push".
  const script = tokens.find(isScriptPath);
  if (script) {
    const name = scriptName(script);
    if (name) return name;
  }

  // Otherwise: drop flags and shell runners, then take the first real word.
  // A second word joins it only when it reads as a subcommand — a bare word,
  // not a flag, a path, a variable or a quoted string. So `make lint` keeps
  // both, `echo "Writing..."` keeps one, and `pnpm exec prettier --write
  // "$FILE"` is "prettier" rather than the runner that launched it.
  const words = tokens.filter((tok) => !tok.startsWith("-"));
  const rest = words.filter((tok) => !WRAPPERS.has(tok.split("/").pop() ?? tok));
  const [first, second] = rest.length > 0 ? rest : words;
  if (!first) return trimmed;
  return isBareWord(second) ? `${first} ${second}` : first;
}

/** A plain word: no quotes, no `$`, no path separator, no flag. */
function isBareWord(token: string | undefined): token is string {
  return typeof token === "string" && /^[A-Za-z][\w-]*$/.test(token);
}
