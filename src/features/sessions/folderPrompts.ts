/**
 * Native prompts for filing sessions into folders. The webview cannot open
 * VS Code's QuickPick or InputBox, so it posts the session ids and the host
 * asks the questions here — the same split Rename uses.
 */
import * as vscode from "vscode";
import type { UserState } from "../../core/types";

/** Folder names are labels in a narrow sidebar; past this they only truncate. */
const MAX_FOLDER_NAME = 60;

type FolderPick = vscode.QuickPickItem & { action: "file" | "new" | "remove"; folder?: string };

/** Folder names sorted the way the list and the explorer show them. */
export function sortFolders(names: readonly string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

function validateFolderName(value: string): string | null {
  if (!value.trim()) return "Enter a folder name";
  if (value.trim().length > MAX_FOLDER_NAME) {
    return `Name must be ${MAX_FOLDER_NAME} characters or fewer`;
  }
  return null;
}

/** Ask for a folder name. Returns the trimmed name, or null when dismissed. */
export async function promptFolderName(title: string, value = ""): Promise<string | null> {
  const result = await vscode.window.showInputBox({
    title,
    prompt: "Folder name",
    value,
    validateInput: validateFolderName,
  });
  return result === undefined ? null : result.trim();
}

/**
 * Ask where to file `sessionIds`. Returns the folder name, "" to take them
 * out of their folder, or null when the user dismissed the picker.
 */
export async function pickFolder(sessionIds: string[], state: UserState): Promise<string | null> {
  const counts = new Map<string, number>();
  for (const folder of Object.values(state.folders)) {
    counts.set(folder, (counts.get(folder) ?? 0) + 1);
  }
  const current = new Set(sessionIds.map((id) => state.folders[id]));
  const filed = sessionIds.some((id) => state.folders[id] !== undefined);
  // Only a folder holding EVERY selected session is "current" — picking it
  // would change nothing, so it is marked rather than offered as a move.
  const allIn = current.size === 1 && filed ? [...current][0] : undefined;

  const items: FolderPick[] = sortFolders(state.folderNames).map((folder) => {
    const n = counts.get(folder) ?? 0;
    return {
      label: `$(folder) ${folder}`,
      description: folder === allIn ? "current" : `${n} session${n === 1 ? "" : "s"}`,
      action: "file",
      folder,
    };
  });
  items.push({ label: "$(new-folder) New folder…", action: "new" });
  if (filed) items.push({ label: "$(close) Remove from folder", action: "remove" });

  const n = sessionIds.length;
  const pick = await vscode.window.showQuickPick(items, {
    title: n === 1 ? "Move session to folder" : `Move ${n} sessions to folder`,
    placeHolder: "Pick a folder",
  });
  if (!pick) return null;
  if (pick.action === "remove") return "";
  if (pick.action === "new") return promptFolderName("New folder");
  return pick.folder ?? null;
}
