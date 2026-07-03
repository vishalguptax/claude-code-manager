/**
 * Agent file mutations — create, update, delete, duplicate the `.md`
 * files under `.claude/agents/`. Editable scopes are `global`
 * (~/.claude/agents/) and `project` (<workspace>/.claude/agents/);
 * plugin agents are read-only and refused here.
 *
 * Edits are LOSSLESS: `updateAgent` rewrites only the managed
 * frontmatter fields via `updateFrontmatterFields`, so anything the UI
 * doesn't manage (permissionMode, color, nested hooks:/mcpServers:, the
 * markdown body) survives untouched. Only create serializes from
 * scratch. Pure Node I/O, no vscode.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { writeFileAtomic } from "../../core/atomicWrite";
import { serializeFrontmatter, updateFrontmatterFields } from "../../core/frontmatter";
import type { AgentInput } from "../../shared/protocol/messages";

/** Global agents directory (~/.claude/agents/). */
const GLOBAL_AGENTS_DIR: string = path.join(os.homedir(), ".claude", "agents");

/** Result of a writer call: ok, or a user-readable reason it was refused. */
export interface WriteResult {
  ok: boolean;
  error?: string;
}

/** Valid Claude agent name: lowercase letters, digits, hyphens. */
const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Resolve the agents directory for an editable scope, or null. */
function agentsDir(scope: string, workspacePath?: string): string | null {
  if (scope === "global") return GLOBAL_AGENTS_DIR;
  if (scope === "project" && workspacePath) return path.join(workspacePath, ".claude", "agents");
  return null;
}

/** The frontmatter fields the UI manages, in canonical order. Empty → omitted. */
function managedFields(input: AgentInput): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = {
    name: input.name,
    description: input.description,
  };
  // "inherit" is the implicit default — don't write it, so an unset model
  // stays unset on disk (matches the parser's inherit fallback).
  if (input.model && input.model !== "inherit") fields.model = input.model;
  if (input.tools.length > 0) fields.tools = input.tools;
  if (input.skills.length > 0) fields.skills = input.skills;
  return fields;
}

/** Fields as an update map (undefined removes) for lossless in-place edits. */
function updateMap(input: AgentInput): Record<string, string | string[] | undefined> {
  return {
    name: input.name,
    description: input.description,
    model: input.model && input.model !== "inherit" ? input.model : undefined,
    tools: input.tools.length > 0 ? input.tools : undefined,
    skills: input.skills.length > 0 ? input.skills : undefined,
  };
}

/**
 * Create a new agent `.md` file. Rejects invalid/duplicate names.
 * Returns the created path in `WriteResult` is not needed — callers
 * re-parse; here we just report success/refusal.
 */
export function createAgent(input: AgentInput, workspacePath?: string): WriteResult {
  if (!NAME_RE.test(input.name)) {
    return { ok: false, error: "Agent name must be lowercase letters, digits, and hyphens." };
  }
  const dir = agentsDir(input.scope, workspacePath);
  if (!dir) return { ok: false, error: `Cannot write to ${input.scope} scope without a workspace.` };

  const filePath = path.join(dir, `${input.name}.md`);
  if (fs.existsSync(filePath)) {
    return { ok: false, error: `An agent named "${input.name}" already exists in ${input.scope} scope.` };
  }

  try {
    fs.mkdirSync(dir, { recursive: true });
    writeFileAtomic(filePath, serializeFrontmatter(managedFields(input), input.body));
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Update an existing agent in place. Rewrites only the managed
 * frontmatter fields and replaces the body, preserving all other
 * frontmatter. Does not rename the file even if `name` changes (the
 * filename is an identity; renaming would orphan references).
 */
export function updateAgent(filePath: string, input: AgentInput): WriteResult {
  if (!NAME_RE.test(input.name)) {
    return { ok: false, error: "Agent name must be lowercase letters, digits, and hyphens." };
  }
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  // Rewrite frontmatter fields losslessly, then swap the body.
  const withFields = updateFrontmatterFields(raw, updateMap(input));
  const next = replaceBody(withFields, input.body);
  try {
    writeFileAtomic(filePath, next);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Delete an agent file. */
export function deleteAgent(filePath: string): WriteResult {
  try {
    fs.rmSync(filePath, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Duplicate an agent file to `<name>-copy.md` (deduping the suffix),
 * updating the `name:` frontmatter field to match the new filename.
 */
export function duplicateAgent(filePath: string): WriteResult {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, ".md");
  let name = `${base}-copy`;
  let dest = path.join(dir, `${name}.md`);
  let n = 2;
  while (fs.existsSync(dest)) {
    name = `${base}-copy-${n++}`;
    dest = path.join(dir, `${name}.md`);
  }
  const next = updateFrontmatterFields(raw, { name });
  try {
    writeFileAtomic(dest, next);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Replace the markdown body (everything after the closing `---` fence)
 * with `body`, leaving the frontmatter block untouched. When there is
 * no fence, the whole file is the body.
 */
function replaceBody(raw: string, body: string): string {
  const match = raw.match(/^(---\r?\n[\s\S]*?\r?\n---\r?\n?)([\s\S]*)$/);
  if (!match) return body;
  return match[1] + body;
}
