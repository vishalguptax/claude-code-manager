/**
 * Shared test fixtures for the skills webview suite.
 */
import type { Skill } from "../../types";

export function makeSkill(over: Partial<Skill> = {}): Skill {
  return {
    id: over.id ?? "global:demo",
    name: over.name ?? "demo",
    description: over.description ?? "A demo skill",
    scope: over.scope ?? "global",
    path: over.path ?? "/home/u/.claude/skills/demo",
    content: over.content ?? "---\nname: demo\n---\nbody text",
    tags: over.tags ?? [],
    group: over.group ?? "",
    pluginName: over.pluginName,
  };
}
