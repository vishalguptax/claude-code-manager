import * as vscode from "vscode";

export interface TerminalRegistry {
  register(sessionId: string, terminal: vscode.Terminal): void;
  has(sessionId: string): boolean;
  view(sessionId: string): boolean;
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
