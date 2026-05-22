/**
 * Pure helpers for the commands list: flattening the sorted command list into
 * scope-grouped header + item rows, deriving group labels and row previews,
 * and copying a slash command to the clipboard. No JSX, no signals — kept
 * framework-free so they are trivially unit-testable.
 */
import type { Command } from "../../types";

/** A row in the flattened, group-labelled list. */
export type Row = { kind: "header"; label: string } | { kind: "item"; command: Command };

/** Human-readable group label for a command's scope. */
export function groupLabel(command: Command): string {
  if (command.scope === "builtin") return "Built-in";
  if (command.scope === "project") return "Project Commands";
  if (command.scope === "plugin") return `Plugin: ${command.pluginName ?? "unknown"}`;
  return "Global Commands";
}

/** Flatten the sorted command list into header + item rows, grouped by scope. */
export function buildRows(list: Command[]): Row[] {
  const rows: Row[] = [];
  let lastLabel: string | null = null;
  for (const command of list) {
    const label = groupLabel(command);
    if (label !== lastLabel) {
      rows.push({ kind: "header", label });
      lastLabel = label;
    }
    rows.push({ kind: "item", command });
  }
  return rows;
}

/** Build the truncated, single-line preview for a command row. */
export function previewText(command: Command): string {
  const source = command.scope === "builtin" ? (command.description ?? "") : command.content;
  const oneLine = source.replace(/\n/g, " ");
  return oneLine.length > 80 ? `${oneLine.slice(0, 80)}...` : oneLine;
}

/** Copy a slash command to the clipboard. */
export function copyCommand(command: Command): void {
  navigator.clipboard?.writeText(`/${command.name}`);
}
