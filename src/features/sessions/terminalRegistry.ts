import * as vscode from "vscode";

export interface TerminalRegistry {
  register(sessionId: string, terminal: vscode.Terminal): void;
  has(sessionId: string): boolean;
  view(sessionId: string): boolean;
  rename(sessionId: string, name: string): Promise<boolean>;
  ids(): string[];
  onChange(cb: (ids: string[]) => void): vscode.Disposable;
  dispose(): void;
}

export function createTerminalRegistry(): TerminalRegistry {
  const byId = new Map<string, vscode.Terminal>();
  const listeners = new Set<(ids: string[]) => void>();

  const emit = (): void => {
    const ids = [...byId.keys()];
    for (const fn of listeners) fn(ids);
  };

  const closeSub = vscode.window.onDidCloseTerminal((closed) => {
    let changed = false;
    for (const [id, term] of byId) {
      if (term === closed) {
        byId.delete(id);
        changed = true;
      }
    }
    if (changed) emit();
  });

  return {
    register(sessionId, terminal) {
      if (byId.get(sessionId) === terminal) return;
      byId.set(sessionId, terminal);
      emit();
    },
    has(sessionId) {
      return byId.has(sessionId);
    },
    view(sessionId) {
      const t = byId.get(sessionId);
      if (!t) return false;
      t.show(false);
      return true;
    },
    // VS Code can rename only the active terminal, so the session's tab is
    // made active first. `preserveFocus` keeps the keyboard where the user
    // typed the rename. The new name is a fixed title, which VS Code shows
    // ahead of anything the CLI writes — the sidebar rename outranks the
    // CLI's titles too.
    async rename(sessionId, name) {
      const t = byId.get(sessionId);
      if (!t || !name) return false;
      t.show(true);
      await vscode.commands.executeCommand("workbench.action.terminal.renameWithArg", { name });
      return true;
    },
    ids() {
      return [...byId.keys()];
    },
    onChange(cb) {
      listeners.add(cb);
      return { dispose: () => listeners.delete(cb) };
    },
    dispose() {
      closeSub.dispose();
      byId.clear();
      listeners.clear();
    },
  };
}
