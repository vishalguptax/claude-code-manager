/**
 * Plugin ids: `<name>@<marketplace>`, the key Claude Code uses everywhere.
 *
 * Pure string rules, shared by the parser, the settings writer and the
 * catalog, and kept apart from all three so none has to import another for
 * them.
 */

/**
 * Whether a plugin id is safe to carry through the UI.
 *
 * Nothing here builds a path from an id — install paths come from the
 * install record, never from concatenation — so a traversal attempt cannot
 * reach the filesystem. It is rejected anyway: an id is a settings key any
 * process can write, and `../../etc/passwd@x` rendered as a plugin name in
 * the sidebar is a phishing surface even when it is inert. Rejecting at the
 * parse boundary also means no downstream code has to re-ask.
 *
 * Plugin names legitimately contain dots (`wordpress.com` ships in the
 * official marketplace), so dots are allowed; separators, `..` segments,
 * control characters and whitespace are not.
 */
export function isSafePluginId(id: string): boolean {
  if (id === "" || id.length > 200) return false;
  if (/[\\/\u0000-\u001f\u007f]/.test(id)) return false;
  if (/\s/.test(id)) return false;
  const at = id.lastIndexOf("@");
  if (at <= 0 || at === id.length - 1) return false;
  const name = id.slice(0, at);
  const marketplace = id.slice(at + 1);
  if (name === "." || name === ".." || marketplace === "." || marketplace === "..") {
    return false;
  }
  return !marketplace.includes("@");
}

/** Split `<name>@<marketplace>` on the LAST `@`, as Claude Code does. */
export function splitPluginId(id: string): { name: string; marketplace: string } {
  const at = id.lastIndexOf("@");
  if (at <= 0) return { name: id, marketplace: "" };
  return { name: id.slice(0, at), marketplace: id.slice(at + 1) };
}

/**
 * Whether an id may be handed to `claude plugin install` on a command line.
 *
 * Stricter than {@link isSafePluginId} on purpose: the id is typed into a
 * terminal whose shell we do not know — bash, zsh, PowerShell or cmd — and
 * no single quoting scheme is safe in all four. An id made only of letters,
 * digits, `.`, `_` and `-` needs no quoting anywhere. That costs nothing
 * real: Claude Code requires kebab-case plugin and marketplace names, and
 * every catalog entry seen in the wild fits (`wordpress.com` among them).
 */
export function isInstallablePluginId(id: string): boolean {
  return isSafePluginId(id) && /^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(id);
}
