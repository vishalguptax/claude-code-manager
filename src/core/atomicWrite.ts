/**
 * Atomic file write: write to a sibling temp file, then rename it over the
 * target. `rename` is atomic on the same filesystem, so a crash or power loss
 * can never leave the target half-written — a reader sees either the old file
 * or the new one, never a truncated mix.
 *
 * This matters because the files we mutate (settings.json, ~/.claude.json,
 * .mcp.json) are also read by Claude Code itself; a partial write would
 * corrupt the user's config. Throws on failure (and removes the temp file);
 * callers that want a boolean wrap it in try/catch.
 */
import * as fs from "fs";

export function writeFileAtomic(filePath: string, data: string | Uint8Array): void {
  const tmp = `${filePath}.csm-tmp`;
  try {
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, filePath);
  } catch (err) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // temp file may not exist — nothing to clean up
    }
    throw err;
  }
}
