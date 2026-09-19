/**
 * Mock of the `vscode` module for unit testing outside the extension host.
 *
 * Only the surfaces actually used by the code under test are stubbed.
 * Add more as needed.
 */

const _extensionChangeListeners: Array<() => void> = [];

export const extensions = {
  getExtension: (_id: string): unknown => undefined,
  onDidChange: (listener: () => void): MockDisposable => {
    _extensionChangeListeners.push(listener);
    return {
      dispose: () => {
        const idx = _extensionChangeListeners.indexOf(listener);
        if (idx >= 0) _extensionChangeListeners.splice(idx, 1);
      },
    };
  },
};

/** Test helper: fire vscode.extensions.onDidChange listeners. */
export function _fireExtensionsChange(): void {
  for (const l of _extensionChangeListeners) l();
}

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
    // Untouched by default: `inspect` is how callers tell "user set
    // false" from "user set nothing", so the two must not collapse.
    inspect: (_key: string) => undefined,
    update: async (_key: string, _value: unknown, _target?: unknown) => {},
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
  /**
   * Documents the host considers open. Empty by default; a test that needs
   * the "file is open in an editor" branch pushes a {@link MockTextDocument}.
   */
  textDocuments: [] as MockTextDocument[],
  openTextDocument: async (_target?: unknown): Promise<unknown> => undefined,
  /** Resolves true (edit applied). Tests spy to assert the edit or refuse it. */
  applyEdit: async (_edit: unknown): Promise<boolean> => true,
  registerTextDocumentContentProvider: (
    _scheme: string,
    _provider: unknown,
  ): MockDisposable => ({ dispose: () => {} }),
  /**
   * `vscode.workspace.fs`. `writeFile` is a no-op that records nothing by
   * default — tests that care assert on a `vi.spyOn` of it, which is how
   * "the write never happened" is proved.
   */
  fs: {
    writeFile: async (_uri: unknown, _content: Uint8Array): Promise<void> => {},
    readFile: async (_uri: unknown): Promise<Uint8Array> => new Uint8Array(),
    stat: async (_uri: unknown): Promise<unknown> => ({ size: 0 }),
  },
};

/** Minimal `vscode.TextDocument` stub for the open-editor branches. */
export interface MockTextDocument {
  uri: { fsPath: string; scheme: string };
  isDirty: boolean;
  lineCount: number;
  lineAt: (line: number) => { range: { end: MockPosition } };
  getText: () => string;
  save: () => Promise<boolean>;
}

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
  _extensionChangeListeners.length = 0;
  _shellIntegrationChangeListeners.length = 0;
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
  /** Absent until shell integration activates, matching the real API — see
   *  runInTerminal in extension/terminal.ts, the one consumer of this. */
  shellIntegration?: unknown;
}

interface MockTab {
  label: string;
  input: unknown;
}

const _terminalCloseListeners: Array<(t: unknown) => void> = [];

export function _fireTerminalClose(t: unknown): void {
  for (const l of _terminalCloseListeners) l(t);
}

const _shellExecStartListeners: Array<(e: { terminal: unknown }) => void> = [];

export function _fireShellExecutionStart(terminal: unknown): void {
  for (const l of _shellExecStartListeners) l({ terminal });
}

const _shellIntegrationChangeListeners: Array<(e: { terminal: unknown }) => void> = [];

/** Test helper: fire onDidChangeTerminalShellIntegration for `terminal`. */
export function _fireShellIntegrationChange(terminal: unknown): void {
  for (const l of _shellIntegrationChangeListeners) l({ terminal });
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
  onDidOpenTerminal: (_listener: (t: unknown) => void): MockDisposable => ({
    dispose: () => {},
  }),
  onDidStartTerminalShellExecution: (
    listener: (e: { terminal: unknown }) => void,
  ): MockDisposable => {
    _shellExecStartListeners.push(listener);
    return {
      dispose: () => {
        const idx = _shellExecStartListeners.indexOf(listener);
        if (idx >= 0) _shellExecStartListeners.splice(idx, 1);
      },
    };
  },
  onDidChangeTerminalShellIntegration: (
    listener: (e: { terminal: unknown }) => void,
  ): MockDisposable => {
    _shellIntegrationChangeListeners.push(listener);
    return {
      dispose: () => {
        const idx = _shellIntegrationChangeListeners.indexOf(listener);
        if (idx >= 0) _shellIntegrationChangeListeners.splice(idx, 1);
      },
    };
  },
  onDidCloseTerminal: (listener: (t: unknown) => void): MockDisposable => {
    _terminalCloseListeners.push(listener);
    return {
      dispose: () => {
        const idx = _terminalCloseListeners.indexOf(listener);
        if (idx >= 0) _terminalCloseListeners.splice(idx, 1);
      },
    };
  },
  showInformationMessage: async (..._args: unknown[]) => undefined,
  showWarningMessage: async (..._args: unknown[]) => undefined,
  showErrorMessage: async (..._args: unknown[]) => undefined,
  showTextDocument: async (_doc: unknown, _options?: unknown): Promise<unknown> => undefined,
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

/**
 * `vscode.version` — the host's semver string. Defaults to our
 * `engines.vscode` floor so version-gated code takes the conservative
 * branch unless a test opts in via `_setVersion`.
 */
export let version = "1.90.0";

/** Test helper: override `vscode.version` for a version-gated test. */
export function _setVersion(value: string): void {
  version = value;
}

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
  // Empty by default: the Claude Code extension's undocumented open
  // command is absent unless a test declares it present.
  getCommands: async (_filterInternal?: boolean): Promise<string[]> => [],
  registerCommand: (_command: string, _callback: (...args: unknown[]) => unknown) => ({
    dispose: () => {},
  }),
};

/**
 * `vscode.ThemeIcon` — a class in the real API, so terminal icon assertions
 * can check `instanceof` and read `id`.
 */
export class ThemeIcon {
  constructor(public readonly id: string) {}
}

export const Uri = {
  file: (path: string) => ({
    fsPath: path,
    scheme: "file",
    path,
    toString: () => path,
  }),
  parse: (value: string) => ({
    fsPath: value,
    scheme: "file",
    path: value,
    toString: () => value,
  }),
  /**
   * `vscode.Uri.from` — the only way to build a URI on a custom scheme with a
   * query. Mirrors the real API's component shape.
   */
  from: (components: {
    scheme: string;
    authority?: string;
    path?: string;
    query?: string;
    fragment?: string;
  }) => {
    const path = components.path ?? "";
    const query = components.query ?? "";
    return {
      fsPath: path,
      scheme: components.scheme,
      path,
      query,
      toString: () => `${components.scheme}:${path}${query ? `?${query}` : ""}`,
    };
  },
  joinPath: (base: { path: string }, ...pathSegments: string[]) => {
    const joined = [base.path, ...pathSegments].join("/");
    return { fsPath: joined, scheme: "file", path: joined, toString: () => joined };
  },
};

/**
 * Minimal `vscode.env` stub. `openExternal` resolves true by default —
 * tests that want to assert on the URI spy it with vi.spyOn and
 * override as needed.
 */
export const env = {
  // Real VS Code reports "vscode"; forks override it ("cursor",
  // "windsurf", "vscode-insiders"). Tests spy/override to assert deep
  // links follow the host scheme rather than hardcoding "vscode://".
  uriScheme: "vscode",
  openExternal: async (_uri: unknown) => true,
  clipboard: {
    writeText: async (_value: string) => {},
  },
};

export enum ConfigurationTarget {
  Global = 1,
  Workspace = 2,
  WorkspaceFolder = 3,
}

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

/** `vscode.Position`. Only the two fields the checkpoint restore path reads. */
export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

/** Alias so the MockTextDocument interface can name the class above. */
export type MockPosition = Position;

/** `vscode.Range`. */
export class Range {
  constructor(
    public start: Position,
    public end: Position,
  ) {}
}

/**
 * `vscode.WorkspaceEdit`. Records the replacements rather than applying them,
 * so a test can assert exactly what would be written.
 */
export class WorkspaceEdit {
  replacements: Array<{ uri: unknown; range: Range; newText: string }> = [];
  replace(uri: unknown, range: Range, newText: string): void {
    this.replacements.push({ uri, range, newText });
  }
}
