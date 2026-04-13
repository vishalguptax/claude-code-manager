/**
 * Mock of the `vscode` module for unit testing outside the extension host.
 *
 * Only the surfaces actually used by the code under test are stubbed.
 * Add more as needed.
 */

export const extensions = {
  getExtension: (_id: string): unknown => undefined,
};

export const workspace = {
  workspaceFolders: [] as Array<{ uri: { fsPath: string } }>,
  getConfiguration: (_section?: string) => ({
    get: (_key: string, defaultValue?: unknown) => defaultValue,
  }),
};

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
  createOutputChannel: (_name: string) => ({
    appendLine: (_value: string) => {},
    show: () => {},
    dispose: () => {},
  }),
};

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
