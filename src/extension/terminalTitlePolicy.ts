/**
 * Keeps VS Code's terminal tab-title settings in step with the opt-in
 * `claudeManager.terminal.keepSessionNames`.
 *
 * Why an opt-in exists at all: VS Code 1.106+ defaults
 * `terminal.integrated.tabs.allowAgentCliTitle` to true, and when a terminal's
 * detected shell type is an agent CLI (`claude` is in VS Code's own list)
 * `TerminalLabelComputer.refreshLabel` forces the title template to
 * `${sequence}` and skips the extension-set name entirely. Every session tab
 * this extension names therefore loses its name the moment `claude` starts,
 * falling back to the process name — the version directory the bundled CLI
 * runs from, e.g. "2.1.276". There is no per-terminal escape: `titleTemplate`
 * is a profile-only field that `vscode.TerminalOptions` does not expose.
 *
 * The lever is a global VS Code setting, which is the user's to pull — this
 * extension ships no `configurationDefaults` and writes nothing unless the
 * opt-in is explicitly on. Same shape as the SessionStart tap: the user turns
 * it on, we converge; they turn it off, we put back exactly what we found.
 *
 * Two settings, not one, because they only work as a pair:
 *  - `allowAgentCliTitle: false` restores the `staticTitle` shortcut, so tabs
 *    WE name keep their session name.
 *  - `tabs.title: "${sequence}"` keeps CLI-driven titles on terminals with no
 *    extension-set name, so a hand-opened `claude` still renames itself.
 * Writing only the first would label those terminals from the process instead,
 * which is the regression the pair exists to avoid.
 */
import * as vscode from "vscode";

const SECTION = "claudeManager.terminal";
const KEY = "keepSessionNames";
/** Fully-qualified id, for `affectsConfiguration`. */
export const KEEP_SESSION_NAMES_SETTING = `${SECTION}.${KEY}`;

/** The VS Code settings we converge, and the value each needs. */
const TARGETS: ReadonlyArray<{ section: string; key: string; value: unknown }> = [
  { section: "terminal.integrated.tabs", key: "allowAgentCliTitle", value: false },
  { section: "terminal.integrated.tabs", key: "title", value: "${sequence}" },
];

/**
 * What each target held before we touched it, so turning the opt-in off
 * restores the user's own value instead of blanket-deleting the key.
 * `null` records "the user had no global value" — JSON has no `undefined`,
 * and a Memento round-trips through JSON.
 */
const PRIOR_KEY = "claudeManager.terminalTitlePriorValues";
type PriorValues = Record<string, unknown>;

/** `"terminal.integrated.tabs.allowAgentCliTitle"` — the Memento's key. */
function fullId(target: { section: string; key: string }): string {
  return `${target.section}.${target.key}`;
}

/**
 * The user's explicit choice.
 *
 * `globalValue` only, and the setting is declared `"scope": "machine"`: these
 * writes land in the user's global settings and affect every window on the
 * machine, so a `.vscode/settings.json` committed to a repository must not be
 * able to trigger them by being opened.
 */
function optedIn(): boolean {
  return vscode.workspace.getConfiguration(SECTION).inspect<boolean>(KEY)?.globalValue === true;
}

/** Turn the pair on, remembering what we displaced. */
async function apply(memento: vscode.Memento): Promise<void> {
  const prior: PriorValues = { ...(memento.get<PriorValues>(PRIOR_KEY) ?? {}) };
  let changed = false;

  for (const target of TARGETS) {
    const config = vscode.workspace.getConfiguration(target.section);
    const inspected = config.inspect(target.key);
    // Host predates the setting — writing an unknown key would only litter
    // settings.json with something VS Code ignores.
    if (inspected === undefined) continue;
    if (inspected.globalValue === target.value) continue;

    const id = fullId(target);
    // Record the displaced value once. A second apply (a reload, a converge
    // after the user edited one key by hand) must not overwrite the original
    // with our own value.
    if (!(id in prior)) {
      prior[id] = inspected.globalValue ?? null;
      changed = true;
    }
    await config.update(target.key, target.value, vscode.ConfigurationTarget.Global);
  }

  if (changed) await memento.update(PRIOR_KEY, prior);
}

/** Turn the pair off, putting back whatever the user had. */
async function revert(memento: vscode.Memento): Promise<void> {
  const prior = memento.get<PriorValues>(PRIOR_KEY);
  if (!prior) return;

  for (const target of TARGETS) {
    const id = fullId(target);
    if (!(id in prior)) continue;
    const previous = prior[id];
    await vscode.workspace.getConfiguration(target.section).update(
      target.key,
      // `undefined` removes the key, which is what `null` stands for here.
      previous === null ? undefined : previous,
      vscode.ConfigurationTarget.Global,
    );
  }

  await memento.update(PRIOR_KEY, undefined);
}

/**
 * Bring VS Code's settings in line with the current opt-in. Safe to call
 * repeatedly: both directions no-op once the settings already agree.
 * Failures are logged, never thrown — this runs during activation.
 */
export async function syncTerminalTitlePolicy(memento: vscode.Memento): Promise<void> {
  try {
    if (optedIn()) {
      await apply(memento);
    } else {
      await revert(memento);
    }
  } catch (err) {
    console.warn("[claude-manager] terminal title policy sync failed:", err);
  }
}

/** Re-converge when the user flips the opt-in. */
export function watchKeepSessionNamesSetting(memento: vscode.Memento): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(KEEP_SESSION_NAMES_SETTING)) void syncTerminalTitlePolicy(memento);
  });
}
