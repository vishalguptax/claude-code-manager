import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import {
  KEEP_SESSION_NAMES_SETTING,
  syncTerminalTitlePolicy,
  watchKeepSessionNamesSetting,
} from "../terminalTitlePolicy";

const ALLOW = "allowAgentCliTitle";
const TITLE = "title";

/** One `update` call, flattened for assertions. */
interface Write {
  key: string;
  value: unknown;
  target: unknown;
}

/**
 * Stub `getConfiguration` for both sections this module reads: our own
 * (`claudeManager.terminal`, where the opt-in lives) and VS Code's
 * (`terminal.integrated.tabs`, which it converges).
 */
function stubConfig(opts: {
  optIn?: boolean | undefined;
  /** Current globalValue per key; a key absent from the map is unset. */
  current?: Record<string, unknown>;
  /** Keys the host does not know at all — `inspect` returns undefined. */
  unknownKeys?: string[];
}): Write[] {
  const { optIn, current = {}, unknownKeys = [] } = opts;
  const writes: Write[] = [];

  vi.spyOn(vscode.workspace, "getConfiguration").mockImplementation((section?: string) => {
    if (section === "claudeManager.terminal") {
      return {
        inspect: () => (optIn === undefined ? {} : { globalValue: optIn }),
      } as never;
    }
    return {
      inspect: (key: string) =>
        unknownKeys.includes(key) ? undefined : { key, globalValue: current[key] },
      update: async (key: string, value: unknown, target: unknown) => {
        writes.push({ key, value, target });
      },
    } as never;
  });

  return writes;
}

/** A Memento backed by a plain object, so assertions can read it. */
function stubMemento(seed: Record<string, unknown> = {}): vscode.Memento {
  const store: Record<string, unknown> = { ...seed };
  return {
    get: (key: string) => store[key],
    update: async (key: string, value: unknown) => {
      if (value === undefined) delete store[key];
      else store[key] = value;
    },
    keys: () => Object.keys(store),
    _store: store,
  } as unknown as vscode.Memento;
}

function stored(memento: vscode.Memento): Record<string, unknown> | undefined {
  return (memento as unknown as { _store: Record<string, unknown> })._store[
    "claudeManager.terminalTitlePriorValues"
  ] as Record<string, unknown> | undefined;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("syncTerminalTitlePolicy — opt-in off", () => {
  it("writes nothing when the user never opted in", async () => {
    const writes = stubConfig({ optIn: undefined });

    await syncTerminalTitlePolicy(stubMemento());

    expect(writes).toEqual([]);
  });

  it("writes nothing when the user opted out and we never applied", async () => {
    const writes = stubConfig({ optIn: false });

    await syncTerminalTitlePolicy(stubMemento());

    expect(writes).toEqual([]);
  });
});

describe("syncTerminalTitlePolicy — opt-in on", () => {
  it("sets both settings globally and records that they were unset", async () => {
    const writes = stubConfig({ optIn: true });
    const memento = stubMemento();

    await syncTerminalTitlePolicy(memento);

    expect(writes).toEqual([
      { key: ALLOW, value: false, target: vscode.ConfigurationTarget.Global },
      { key: TITLE, value: "${sequence}", target: vscode.ConfigurationTarget.Global },
    ]);
    // null == "the user had no value here", so revert removes the key.
    expect(stored(memento)).toEqual({
      "terminal.integrated.tabs.allowAgentCliTitle": null,
      "terminal.integrated.tabs.title": null,
    });
  });

  it("remembers the user's own values before displacing them", async () => {
    stubConfig({ optIn: true, current: { [TITLE]: "${process}" } });
    const memento = stubMemento();

    await syncTerminalTitlePolicy(memento);

    expect(stored(memento)?.["terminal.integrated.tabs.title"]).toBe("${process}");
  });

  it("skips a setting that already holds the wanted value", async () => {
    const writes = stubConfig({ optIn: true, current: { [ALLOW]: false } });

    await syncTerminalTitlePolicy(stubMemento());

    expect(writes.map((w) => w.key)).toEqual([TITLE]);
  });

  it("skips a setting the host does not know", async () => {
    const writes = stubConfig({ optIn: true, unknownKeys: [ALLOW] });

    await syncTerminalTitlePolicy(stubMemento());

    expect(writes.map((w) => w.key)).toEqual([TITLE]);
  });

  // A reload re-runs apply(). The recorded original must survive it, or
  // turning the opt-in off would "restore" our own value.
  it("keeps the first recorded value when applied twice", async () => {
    stubConfig({ optIn: true, current: { [TITLE]: "${process}" } });
    const memento = stubMemento();

    await syncTerminalTitlePolicy(memento);
    await syncTerminalTitlePolicy(memento);

    expect(stored(memento)?.["terminal.integrated.tabs.title"]).toBe("${process}");
  });
});

describe("syncTerminalTitlePolicy — turning the opt-in off", () => {
  it("removes the keys we added and forgets the record", async () => {
    const writes = stubConfig({ optIn: false });
    const memento = stubMemento({
      "claudeManager.terminalTitlePriorValues": {
        "terminal.integrated.tabs.allowAgentCliTitle": null,
        "terminal.integrated.tabs.title": null,
      },
    });

    await syncTerminalTitlePolicy(memento);

    expect(writes).toEqual([
      { key: ALLOW, value: undefined, target: vscode.ConfigurationTarget.Global },
      { key: TITLE, value: undefined, target: vscode.ConfigurationTarget.Global },
    ]);
    expect(stored(memento)).toBeUndefined();
  });

  it("restores a value the user had set themselves", async () => {
    const writes = stubConfig({ optIn: false });
    const memento = stubMemento({
      "claudeManager.terminalTitlePriorValues": {
        "terminal.integrated.tabs.title": "${process}",
      },
    });

    await syncTerminalTitlePolicy(memento);

    expect(writes).toEqual([
      { key: TITLE, value: "${process}", target: vscode.ConfigurationTarget.Global },
    ]);
  });
});

describe("failure handling", () => {
  it("never throws into activation", async () => {
    vi.spyOn(vscode.workspace, "getConfiguration").mockImplementation(() => {
      throw new Error("boom");
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(syncTerminalTitlePolicy(stubMemento())).resolves.toBeUndefined();
  });
});

describe("watchKeepSessionNamesSetting", () => {
  it("re-converges only when our setting changed", async () => {
    const writes = stubConfig({ optIn: true });
    const listeners: Array<(e: { affectsConfiguration: (s: string) => boolean }) => void> = [];
    vi.spyOn(vscode.workspace, "onDidChangeConfiguration").mockImplementation((listener) => {
      listeners.push(listener as (e: { affectsConfiguration: (s: string) => boolean }) => void);
      return { dispose: () => {} };
    });

    watchKeepSessionNamesSetting(stubMemento());
    listeners[0]({ affectsConfiguration: (s) => s === "editor.fontSize" });
    await Promise.resolve();
    expect(writes).toEqual([]);

    listeners[0]({ affectsConfiguration: (s) => s === KEEP_SESSION_NAMES_SETTING });
    await Promise.resolve();
    await Promise.resolve();
    expect(writes.map((w) => w.key)).toEqual([ALLOW, TITLE]);
  });
});
