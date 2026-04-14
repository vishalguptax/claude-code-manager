/**
 * Mock of the `vscode` module for unit testing outside the extension host.
 *
 * Only the surfaces actually used by the code under test are stubbed.
 * Add more as needed.
 */

export const extensions = {
  getExtension: (_id: string): unknown => undefined,
};

type WorkspaceFolder = { uri: { fsPath: string }; name: string; index: number };

interface MockDisposable {
  dispose: () => void;
}

const _workspaceFolderListeners: Array<(e: unknown) => void> = [];
const _configChangeListeners: Array<(e: { affectsConfiguration: (section: string) => boolean }) => void> = [];

export const workspace = {
  workspaceFolders: [] as WorkspaceFolder[],
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  }),
  getWorkspaceFolder: (_uri: { fsPath: string }): WorkspaceFolder | undefined => undefined,
  onDidChangeWorkspaceFolders: (listener: (e: unknown) => void): MockDisposable => {
    _workspaceFolderListeners.push(listener);
    return {
      dispose: () => {
        const idx = _workspaceFolderListeners.indexOf(listener);
        if (idx >= 0) _workspaceFolderListeners.splice(idx, 1);
      },
    };
  },
  onDidChangeConfiguration: (
    listener: (e: { affectsConfiguration: (section: string) => boolean }) => void,
  ): MockDisposable => {
    _configChangeListeners.push(listener);
    return {
      dispose: () => {
        const idx = _configChangeListeners.indexOf(listener);
        if (idx >= 0) _configChangeListeners.splice(idx, 1);
      },
    };
  },
  createFileSystemWatcher: (_pattern: unknown) => ({
    onDidChange: (_l: () => void): MockDisposable => ({ dispose: () => {} }),
    onDidCreate: (_l: () => void): MockDisposable => ({ dispose: () => {} }),
    onDidDelete: (_l: () => void): MockDisposable => ({ dispose: () => {} }),
    dispose: () => {},
  }),
};

/** Test helper: fire onDidChangeWorkspaceFolders listeners. */
export function _fireWorkspaceFoldersChange(): void {
  for (const l of _workspaceFolderListeners) l({});
}

/** Test helper: fire onDidChangeConfiguration listeners with a section filter. */
export function _fireConfigChange(affectedSection: string): void {
  const event = {
    affectsConfiguration: (section: string) => section === affectedSection || affectedSection.startsWith(section + "."),
  };
  for (const l of _configChangeListeners) l(event);
}

/** Test helper: reset all listener lists between tests. */
export function _resetListeners(): void {
  _workspaceFolderListeners.length = 0;
  _configChangeListeners.length = 0;
}

export class RelativePattern {
  constructor(
    public base: { fsPath: string } | string,
    public pattern: string,
  ) {}
}

export interface MockTerminal {
  name: string;
  exitStatus: { code: number | undefined } | undefined;
  state: { isInteractedWith: boolean };
  sentText: string[];
  sendText: (text: string) => void;
  show: () => void;
  dispose: () => void;
  createOptions?: Record<string, unknown>;
}

interface MockTab {
  label: string;
  input: unknown;
}

interface MockTabGroup {
  viewColumn: number;
  tabs: MockTab[];
}

export const window = {
  terminals: [] as MockTerminal[],
  activeTextEditor: undefined as { document: { uri: { fsPath: string } } } | undefined,
  createTerminal: (options: Record<string, unknown>): MockTerminal => {
    const t: MockTerminal = {
      name: typeof options.name === "string" ? options.name : "terminal",
      exitStatus: undefined,
      state: { isInteractedWith: false },
      sentText: [],
      sendText(text: string) {
        this.sentText.push(text);
      },
      show() {},
      dispose() {
        this.exitStatus = { code: 0 };
      },
      createOptions: options,
    };
    window.terminals.push(t);
    return t;
  },
  tabGroups: {
    all: [] as MockTabGroup[],
  },
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  showInputBox: async (_options?: unknown) => undefined,
  showOpenDialog: async (_options?: unknown): Promise<unknown> => undefined,
  showSaveDialog: async (_options?: unknown): Promise<unknown> => undefined,
  showQuickPick: async (_items: unknown, _options?: unknown): Promise<unknown> => undefined,
  createOutputChannel: (_name: string) => ({
    appendLine: (_value: string) => {},
    show: () => {},
    dispose: () => {},
  }),
  registerWebviewViewProvider: (
    _viewId: string,
    _provider: unknown,
    _options?: unknown,
  ) => ({ dispose: () => {} }),
  createStatusBarItem: (_alignment?: number, _priority?: number) => ({
    text: "",
    tooltip: "",
    command: "",
    show: () => {},
    dispose: () => {},
  }),
};

export const QuickPickItemKind = {
  Separator: -1,
  Default: 0,
} as const;

export enum StatusBarAlignment {
  Left = 1,
  Right = 2,
}

export class TabInputTerminal {}

export const commands = {
  executeCommand: async (..._args: unknown[]) => undefined,
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
};

export const Uri = {
  file: (path: string) => ({ fsPath: path, scheme: "file", path }),
  parse: (value: string) => ({ fsPath: value, scheme: "file", path: value }),
  joinPath: (base: { path: string }, ...pathSegments: string[]) => {
    const joined = [base.path, ...pathSegments].join("/");
    return { fsPath: joined, scheme: "file", path: joined };
  },
};

export enum ViewColumn {
  Active = -1,
  Beside = -2,
  One = 1,
  Two = 2,
  Three = 3,
}

export class EventEmitter {
  private listeners: Array<(...args: unknown[]) => void> = [];
  event = (listener: (...args: unknown[]) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data?: unknown) {
    for (const l of this.listeners) l(data);
  }
  dispose() {
    this.listeners = [];
  }
}
