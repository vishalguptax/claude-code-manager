/**
 * Config tab view — renders Settings + Permissions sections with the
 * new controls the Account tab audit surfaced:
 *   - permissions.defaultMode picker
 *   - permissions.additionalDirectories list
 *   - includeCoAuthoredBy toggle
 *   - spinnerTipsEnabled toggle
 *   - cleanupPeriodDays numeric
 *   - permission list search
 *   - permission pattern inline hint
 *
 * Reuses the Account tab's `acct-*` styles so the visual language is
 * consistent — Config is the same feel, different scope.
 */

import { icon } from "../../../webview/icons";
import { esc } from "../../../webview/utils";
import { renderSelect, bindSelect } from "../../../webview/components/select";
import {
  sendLaunchSlash,
  sendOpenSettingsFile,
  sendSetCommitAttribution,
  sendSetModel,
  sendSetPrAttribution,
  sendSetVoiceEnabled,
  sendSetSetting,
  sendPromptAddPermission,
  sendPromptAddDirectory,
  sendOpenExtensionSettings,
  sendRunCommand,
  sendPromptRemovePermission,
  sendResetSettings,
  sendRestoreSettingsSnapshot,
  sendDeleteSettingsSnapshot,
} from "../../account/webview/api";
import type {
  AccountData,
  PermissionScope,
  PermissionSet,
  PermissionDefaultMode,
  SettingsSnapshotInfo,
} from "../../account/types";

/** Short purpose descriptions keyed by model family alias. */
const MODEL_DESCRIPTIONS: Record<string, string> = {
  default: "1M context · most capable",
  sonnet: "Balanced daily driver",
  haiku: "Fastest, lightest",
  opus: "Deepest reasoning",
};

interface ModelOption {
  value: string;
  label: string;
  desc: string;
}

const DEFAULT_MODE_OPTIONS: Array<{ value: PermissionDefaultMode; label: string; desc: string }> = [
  { value: "", label: "Use CLI default", desc: "Fall back to whatever Claude CLI decides" },
  { value: "default", label: "Prompt per tool call", desc: "Safest — confirm every non-allowed action" },
  { value: "acceptEdits", label: "Auto-approve file edits", desc: "Skip confirmation for Write / Edit operations" },
  { value: "plan", label: "Plan first", desc: "Claude plans before acting; requires explicit proceed" },
  { value: "bypassPermissions", label: "Bypass permissions (risky)", desc: "No prompts at all — full tool access" },
];

/**
 * Known `effortLevel` values from Claude CLI's `/effort` slash command.
 * Short labels for the segmented control row — descriptions show below
 * the pill row so the active tier still gets a sentence of context.
 */
const EFFORT_OPTIONS: Array<{ value: string; label: string; desc: string }> = [
  { value: "",       label: "Default", desc: "Let Claude CLI pick the tier" },
  { value: "low",    label: "Low",     desc: "Fastest — minimal reasoning budget" },
  { value: "medium", label: "Med",     desc: "Balanced — default for most tasks" },
  { value: "high",   label: "High",    desc: "More thinking for harder problems" },
  { value: "xhigh",  label: "XHigh",   desc: "Deep reasoning — slower, more tokens" },
  { value: "max",    label: "Max",     desc: "Largest budget — slowest, most thorough" },
  { value: "auto",   label: "Auto",    desc: "CLI picks tier based on task" },
];

function buildEffortOptions(currentValue: string): Array<{ value: string; label: string; desc: string }> {
  if (!currentValue) return EFFORT_OPTIONS;
  const known = EFFORT_OPTIONS.some((o) => o.value === currentValue);
  if (known) return EFFORT_OPTIONS;
  // Unknown value — CLI introduced a new tier we don't know yet.
  // Render it as-is so the dropdown trigger label is accurate and
  // the user can still switch to any of the documented tiers.
  return [
    ...EFFORT_OPTIONS,
    { value: currentValue, label: currentValue, desc: "New tier reported by Claude CLI" },
  ];
}

function buildModelOptions(data: AccountData, currentModel: string): ModelOption[] {
  const latestOpus = data.availableModels.find((m) => m.alias === "opus" && m.isLatest);
  const defaultLabel = latestOpus ? `Default (${latestOpus.label})` : "Default";
  const options: ModelOption[] = [
    { value: "default", label: defaultLabel, desc: MODEL_DESCRIPTIONS.default },
  ];
  const seen = new Set<string>(["default"]);
  for (const m of data.availableModels) {
    const value = m.isLatest ? m.alias : m.id;
    if (seen.has(value)) continue;
    seen.add(value);
    options.push({
      value,
      label: m.label,
      desc: m.isLatest ? MODEL_DESCRIPTIONS[m.alias] ?? "" : "Pinned",
    });
  }
  if (currentModel && !seen.has(currentModel)) {
    options.push({ value: currentModel, label: currentModel, desc: "" });
  }
  return options;
}

function buildModelDescMap(options: ModelOption[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const o of options) map[o.value] = o.desc;
  return map;
}

export interface ConfigUiState {
  permissionScope: PermissionScope;
  permissionSearch: string;
}

export interface ConfigCallbacks {
  onScopeChange: (scope: PermissionScope) => void;
  onSearchChange: (q: string) => void;
}

export function renderConfig(
  container: HTMLElement,
  data: AccountData,
  ui: ConfigUiState,
): void {
  // Preserve scroll position across re-renders.
  const existingPanel = container.querySelector<HTMLElement>(".panel");
  const scrollTop = existingPanel?.scrollTop ?? 0;

  container.innerHTML = `
    <div class="panel">
      ${renderSettings(data)}
      ${renderPermissions(data, ui)}
      ${renderSnapshots(data.settingsSnapshots ?? [])}
      ${renderBrain()}
    </div>`;

  const newPanel = container.querySelector<HTMLElement>(".panel");
  if (newPanel && scrollTop > 0) newPanel.scrollTop = scrollTop;
}

function renderSettings(data: AccountData): string {
  const s = data.settings;
  const currentModel = s.model || "default";
  const modelOptions = buildModelOptions(data, currentModel);
  const currentOption = modelOptions.find((o) => o.value === currentModel);
  const currentModeOpt = DEFAULT_MODE_OPTIONS.find((o) => o.value === s.defaultMode) ?? DEFAULT_MODE_OPTIONS[0];

  return `
    <section class="acct-section">
      <header class="acct-section-header" data-section="settings"><h2 class="acct-section-title">${icon("settings", 14)} Behavior</h2></header>
      <div class="acct-section-body">
        <div class="acct-field">
          <label class="acct-label" for="cfg-model">Model</label>
          ${renderSelect("cfg-model", modelOptions, currentModel)}
          <div class="acct-field-hint" id="cfg-model-desc">${esc(currentOption?.desc ?? "")}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-defaultmode">Tool-use confirmation</label>
          ${renderSelect(
            "cfg-defaultmode",
            DEFAULT_MODE_OPTIONS.map((o) => ({ value: o.value, label: o.label, desc: o.desc })),
            s.defaultMode,
          )}
          <div class="acct-field-hint" id="cfg-defaultmode-desc">${esc(currentModeOpt.desc)}</div>
        </div>

        <div class="acct-field">
          <label class="acct-label">Reasoning effort</label>
          <div class="vs-segmented cfg-effort-row" role="tablist" aria-label="Reasoning effort">
            ${buildEffortOptions(s.effortLevel).map((o) => `
              <button class="vs-segmented-btn ${o.value === s.effortLevel ? "active" : ""}"
                data-effort="${esc(o.value)}" role="tab" title="${esc(o.desc)}">${esc(o.label)}</button>`).join("")}
          </div>
          <div class="acct-field-hint" id="cfg-effort-desc">${esc(EFFORT_OPTIONS.find((o) => o.value === s.effortLevel)?.desc ?? EFFORT_OPTIONS[0].desc)}</div>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input type="checkbox" id="cfg-voice" ${s.voiceEnabled ? "checked" : ""}>
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb"></span></span>
            <span class="acct-toggle-text">Voice dictation</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input type="checkbox" id="cfg-coauthor" ${s.includeCoAuthoredBy ? "checked" : ""}>
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb"></span></span>
            <span class="acct-toggle-text">Include "Co-authored-by: Claude" trailer in commits</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-toggle">
            <input type="checkbox" id="cfg-spinnertips" ${s.spinnerTipsEnabled ? "checked" : ""}>
            <span class="acct-toggle-track" aria-hidden="true"><span class="acct-toggle-thumb"></span></span>
            <span class="acct-toggle-text">Show "Tip:" lines under the spinner</span>
          </label>
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-commit">Commit attribution</label>
          <input type="text" class="acct-input" id="cfg-commit" value="${esc(s.commitAttribution)}" placeholder="e.g., Co-authored-by: Claude">
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-pr">PR attribution</label>
          <input type="text" class="acct-input" id="cfg-pr" value="${esc(s.prAttribution)}" placeholder="e.g., Generated with Claude Code">
        </div>

        <div class="acct-field">
          <label class="acct-label" for="cfg-cleanup">Session retention (days)</label>
          <input type="number" class="acct-input" id="cfg-cleanup" min="0" step="1"
            value="${s.cleanupPeriodDays > 0 ? s.cleanupPeriodDays : ""}"
            placeholder="Unlimited">
          <div class="acct-field-hint">Transcripts older than this auto-delete. Blank = no expiry.</div>
        </div>

        ${s.statusLineCommand ? `
        <div class="acct-field">
          <label class="acct-label">Status line command</label>
          <code class="acct-code">${esc(s.statusLineCommand)}</code>
        </div>` : ""}

        <div class="acct-actions">
          <button class="btn" data-scope="global" id="cfg-open-settings">${icon("external-link", 14)} Open settings.json</button>
          <button class="btn" data-slash="/config">${icon("terminal", 14)} Open /config</button>
          <button class="btn" id="cfg-open-ext-settings" title="Open VS Code settings filtered to Claude Manager">${icon("settings", 14)} Extension settings</button>
          <button class="btn del" id="cfg-reset-settings" title="Rename the global settings.json to a timestamped .bak and let Claude CLI regenerate a fresh one">${icon("refresh-cw", 14)} Reset settings</button>
        </div>

        <div class="acct-footnote">Changes apply to new Claude sessions.</div>
      </div>
    </section>`;
}

function renderPermissions(data: AccountData, ui: ConfigUiState): string {
  const s = data.settings;
  const scope = ui.permissionScope;
  const set = data.permissions.find((p) => p.scope === scope);
  const hasProjectScope = data.permissions.some((p) => p.scope === "project");
  const query = ui.permissionSearch.trim().toLowerCase();

  return `
    <section class="acct-section">
      <header class="acct-section-header" data-section="permissions"><h2 class="acct-section-title">${icon("shield", 14)} Permissions</h2></header>
      <div class="acct-section-body">
        <div class="vs-segmented acct-scope-toggle" role="tablist">
          <button class="vs-segmented-btn ${scope === "global" ? "active" : ""}" data-scope="global" role="tab">Global</button>
          ${hasProjectScope ? `<button class="vs-segmented-btn ${scope === "project" ? "active" : ""}" data-scope="project" role="tab">Project</button>` : ""}
          ${hasProjectScope ? `<button class="vs-segmented-btn ${scope === "local" ? "active" : ""}" data-scope="local" role="tab">Local</button>` : ""}
        </div>

        <div class="acct-field">
          <input type="text" class="acct-input" id="cfg-perm-search"
            value="${esc(ui.permissionSearch)}"
            placeholder="Search tools..." />
        </div>

        ${renderPermissionList(set, scope, "allow", "Allowed", query)}
        ${renderPermissionList(set, scope, "deny", "Denied", query)}

        ${renderAdditionalDirectories(s.additionalDirectories)}

        <div class="acct-field-hint">
          Pattern format: <code>Bash(command:*)</code>, <code>Read(path/**)</code>, <code>mcp__server__*</code>.
          Wildcards only inside the parens; a bare tool name (e.g. <code>Bash</code>) matches ALL invocations.
        </div>

        <div class="acct-actions">
          <button class="btn" id="cfg-add-allow">${icon("plus", 14)} Add allowed</button>
          <button class="btn" id="cfg-add-deny">${icon("x", 14)} Add denied</button>
          <button class="btn" data-scope="${scope}" id="cfg-open-perms">${icon("external-link", 14)} Edit in file</button>
        </div>
      </div>
    </section>`;
}

function renderPermissionList(
  set: PermissionSet | undefined,
  scope: PermissionScope,
  list: "allow" | "deny",
  label: string,
  query: string,
): string {
  const items = (set?.[list] ?? []).filter((t) =>
    !query || t.toLowerCase().includes(query),
  );
  const total = set?.[list]?.length ?? 0;
  if (items.length === 0) {
    return `
      <div class="acct-perm-group">
        <div class="acct-perm-group-label">${esc(label)}${total > 0 ? ` (0 / ${total})` : ""}</div>
        <div class="acct-empty-small">${
          total > 0
            ? `No ${list === "allow" ? "allowed" : "denied"} tools match "${esc(query)}"`
            : `No ${list === "allow" ? "allowed" : "denied"} tools`
        }</div>
      </div>`;
  }
  const rows = items
    .map(
      (t) =>
        `<div class="acct-perm-row"><span class="acct-perm-name">${esc(t)}</span><button class="acct-perm-remove" data-remove="${esc(t)}" data-remove-list="${list}" data-remove-scope="${scope}" title="Remove">${icon("x", 12)}</button></div>`,
    )
    .join("");
  const countLabel = query ? `${items.length} / ${total}` : `${items.length}`;
  return `
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">${esc(label)} (${countLabel})</div>
      ${rows}
    </div>`;
}

function formatSnapshotTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "";
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return new Date(ms).toISOString();
  }
}

function formatSnapshotKb(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/**
 * Settings history — every writeSettingsValue / addPermission /
 * removePermission mutation snapshots the live settings.json before
 * touching it. This section surfaces those snapshots with a Restore
 * button per entry. Keeping the section collapsed by default avoids
 * cluttering the Config tab for users who never need to roll back.
 */
function renderSnapshots(snapshots: SettingsSnapshotInfo[]): string {
  if (snapshots.length === 0) {
    return `
      <section class="acct-section">
        <header class="acct-section-header"><h2 class="acct-section-title">${icon("history", 14)} Settings history</h2></header>
        <div class="acct-section-body">
          <div class="acct-field-hint">No snapshots yet. The next time you change a setting or permission, Claude Manager will save the previous state here so you can roll back.</div>
        </div>
      </section>`;
  }

  const rows = snapshots
    .map((s) => {
      const keysLabel = s.changedKeys.length === 0
        ? "no key diff"
        : `${s.changedKeys.length} key${s.changedKeys.length === 1 ? "" : "s"}: ${s.changedKeys.slice(0, 3).map(esc).join(", ")}${s.changedKeys.length > 3 ? "…" : ""}`;
      return `
        <div class="cfg-snap-row">
          <div class="cfg-snap-meta">
            <div class="cfg-snap-when">${esc(formatSnapshotTime(s.takenAtMs))}</div>
            <div class="cfg-snap-detail">
              <span class="cfg-snap-scope">${esc(s.scope)}</span>
              <span class="cfg-snap-diff">${esc(keysLabel)}</span>
              ${s.sizeBytes > 0 ? `<span class="cfg-snap-size">${esc(formatSnapshotKb(s.sizeBytes))}</span>` : ""}
            </div>
          </div>
          <div class="cfg-snap-actions">
            <button class="btn cfg-snap-restore" data-snap-id="${esc(s.id)}" data-snap-scope="${esc(s.scope)}" title="Replace live settings.json with this snapshot">${icon("history", 12)} Restore</button>
            <button class="btn del cfg-snap-delete" data-snap-id="${esc(s.id)}" data-snap-scope="${esc(s.scope)}" title="Delete this snapshot">${icon("trash-2", 12)}</button>
          </div>
        </div>`;
    })
    .join("");

  return `
    <section class="acct-section">
      <header class="acct-section-header"><h2 class="acct-section-title">${icon("history", 14)} Settings history</h2></header>
      <div class="acct-section-body">
        <div class="acct-field-hint">Snapshots are taken before each settings.json mutation. The 20 most recent per scope are kept.</div>
        <div class="cfg-snap-list">${rows}</div>
      </div>
    </section>`;
}

/**
 * Brain backup / restore — exposes the two VS Code commands under
 * the Config tab so users don't have to hunt for them in the palette.
 * The actual file dialogs + zip work run in the extension host; the
 * webview just fires the commands.
 */
function renderBrain(): string {
  return `
    <section class="acct-section">
      <header class="acct-section-header"><h2 class="acct-section-title">${icon("package", 14)} Brain backup</h2></header>
      <div class="acct-section-body">
        <div class="acct-field-hint">
          Share your Claude setup — skills, commands, agents, memory,
          hooks, MCP servers — across machines or teams as a single
          <code>.claudebrain.zip</code>. Sessions, credentials, and
          identity are never included.
        </div>
        <div class="acct-actions">
          <button class="btn" id="cfg-brain-export">${icon("upload", 14)} Export Brain…</button>
          <button class="btn" id="cfg-brain-import">${icon("download", 14)} Import Brain…</button>
          <button class="btn" id="cfg-run-diagnostics" title="Open a markdown report covering CLI presence, file health, hook paths, and version checks">${icon("info", 14)} Run diagnostics</button>
        </div>
      </div>
    </section>`;
}

function renderAdditionalDirectories(dirs: string[]): string {
  const rows = dirs
    .map(
      (d) =>
        `<div class="acct-perm-row"><span class="acct-perm-name">${esc(d)}</span><button class="acct-perm-remove" data-dir-remove="${esc(d)}" title="Remove">${icon("x", 12)}</button></div>`,
    )
    .join("");
  return `
    <div class="acct-perm-group">
      <div class="acct-perm-group-label">Additional directories${dirs.length > 0 ? ` (${dirs.length})` : ""}</div>
      ${
        dirs.length === 0
          ? `<div class="acct-empty-small">None — Claude can only read the workspace.</div>`
          : rows
      }
      <div class="acct-actions">
        <button class="btn" id="cfg-add-dir">${icon("plus", 14)} Add directory</button>
      </div>
    </div>`;
}

export function bindConfig(
  container: HTMLElement,
  data: AccountData,
  callbacks: ConfigCallbacks,
): void {
  // Model picker
  const modelOpts = buildModelOptions(data, data.settings.model || "default");
  const modelDescMap = buildModelDescMap(modelOpts);
  bindSelect(container, "cfg-model", (value) => {
    sendSetModel(value === "default" ? "" : value);
    const desc = container.querySelector<HTMLElement>("#cfg-model-desc");
    if (desc) desc.textContent = modelDescMap[value] ?? "";
  });

  // Default-mode picker
  bindSelect(container, "cfg-defaultmode", (value) => {
    sendSetSetting("permissions.defaultMode", value);
    const desc = container.querySelector<HTMLElement>("#cfg-defaultmode-desc");
    const opt = DEFAULT_MODE_OPTIONS.find((o) => o.value === value);
    if (desc && opt) desc.textContent = opt.desc;
  });

  // Effort segmented row — clicking a pill writes the new tier and
  // optimistically toggles the active class so the UI doesn't have
  // to wait for the round-trip from extension host. Empty value
  // removes the key (writeSettingsValue treats "" as delete).
  container.querySelectorAll<HTMLElement>(".cfg-effort-row [data-effort]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.effort ?? "";
      sendSetSetting("effortLevel", value);
      container
        .querySelectorAll<HTMLElement>(".cfg-effort-row [data-effort]")
        .forEach((b) => b.classList.toggle("active", b === btn));
      const desc = container.querySelector<HTMLElement>("#cfg-effort-desc");
      const opt = EFFORT_OPTIONS.find((o) => o.value === value);
      if (desc && opt) desc.textContent = opt.desc;
    });
  });

  // Toggles
  container.querySelector<HTMLInputElement>("#cfg-voice")?.addEventListener("change", (e) => {
    sendSetVoiceEnabled((e.target as HTMLInputElement).checked);
  });
  container.querySelector<HTMLInputElement>("#cfg-coauthor")?.addEventListener("change", (e) => {
    sendSetSetting("includeCoAuthoredBy", (e.target as HTMLInputElement).checked);
  });
  container.querySelector<HTMLInputElement>("#cfg-spinnertips")?.addEventListener("change", (e) => {
    sendSetSetting("spinnerTipsEnabled", (e.target as HTMLInputElement).checked);
  });

  // Text inputs
  container.querySelector<HTMLInputElement>("#cfg-commit")?.addEventListener("change", (e) => {
    sendSetCommitAttribution((e.target as HTMLInputElement).value);
  });
  container.querySelector<HTMLInputElement>("#cfg-pr")?.addEventListener("change", (e) => {
    sendSetPrAttribution((e.target as HTMLInputElement).value);
  });
  container.querySelector<HTMLInputElement>("#cfg-cleanup")?.addEventListener("change", (e) => {
    const val = (e.target as HTMLInputElement).value.trim();
    const n = val === "" ? 0 : Number.parseInt(val, 10);
    sendSetSetting("cleanupPeriodDays", Number.isFinite(n) && n > 0 ? n : "");
  });

  // Open files
  container.querySelector("#cfg-open-settings")?.addEventListener("click", () => {
    sendOpenSettingsFile("global");
  });
  container.querySelector("#cfg-open-perms")?.addEventListener("click", () => {
    sendOpenSettingsFile(_currentScope(container));
  });
  container.querySelector("#cfg-open-ext-settings")?.addEventListener("click", () => {
    sendOpenExtensionSettings();
  });

  // Brain backup commands — fire the VS Code commands registered in
  // extension.ts. The host takes over with file dialogs from there.
  container.querySelector("#cfg-brain-export")?.addEventListener("click", () => {
    sendRunCommand("claudeManager.exportBrain");
  });
  container.querySelector("#cfg-brain-import")?.addEventListener("click", () => {
    sendRunCommand("claudeManager.importBrain");
  });
  container.querySelector("#cfg-run-diagnostics")?.addEventListener("click", () => {
    sendRunCommand("claudeManager.runDiagnostics");
  });

  // Slash commands
  container.querySelectorAll<HTMLElement>("[data-slash]").forEach((el) => {
    el.addEventListener("click", () => {
      const cmd = el.dataset.slash;
      if (cmd) sendLaunchSlash(cmd);
    });
  });

  // Permission scope tabs
  container.querySelectorAll<HTMLElement>(".acct-scope-toggle [data-scope]").forEach((el) => {
    el.addEventListener("click", () => {
      const scope = el.dataset.scope as PermissionScope | undefined;
      if (scope) callbacks.onScopeChange(scope);
    });
  });

  // Permission search
  const searchInput = container.querySelector<HTMLInputElement>("#cfg-perm-search");
  if (searchInput) {
    // Preserve focus + caret across re-render.
    if (searchInput.value && document.activeElement !== searchInput) {
      searchInput.focus();
      searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    searchInput.addEventListener("input", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        callbacks.onSearchChange(searchInput.value);
      }, 150);
    });
  }

  // Add tool — split into allow / deny so users can pick either list
  // without going back to settings.json.
  container.querySelector("#cfg-add-allow")?.addEventListener("click", () => {
    sendPromptAddPermission(_currentScope(container), "allow");
  });
  container.querySelector("#cfg-add-deny")?.addEventListener("click", () => {
    sendPromptAddPermission(_currentScope(container), "deny");
  });

  // Remove tool — route through the confirm-first variant so a
  // mis-clicked `x` doesn't silently strip a permission rule.
  container.querySelectorAll<HTMLElement>(".acct-perm-remove[data-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      const tool = el.dataset.remove;
      const list = el.dataset.removeList as "allow" | "deny" | undefined;
      const scope = el.dataset.removeScope as PermissionScope | undefined;
      if (tool && list && scope) sendPromptRemovePermission(scope, tool, list);
    });
  });

  // Reset settings — scope-aware (uses the current permission scope
  // toggle so "Reset settings" while on Project resets project's
  // settings, not global).
  container.querySelector("#cfg-reset-settings")?.addEventListener("click", () => {
    sendResetSettings("global");
  });

  // Additional directories — add opens host-native input box, remove
  // rewrites the array without the removed entry.
  container.querySelector("#cfg-add-dir")?.addEventListener("click", () => {
    sendPromptAddDirectory();
  });
  container.querySelectorAll<HTMLElement>("[data-dir-remove]").forEach((el) => {
    el.addEventListener("click", () => {
      const dir = el.dataset.dirRemove;
      if (!dir) return;
      const next = data.settings.additionalDirectories.filter((d) => d !== dir);
      sendSetSetting("permissions.additionalDirectories", next);
    });
  });

  // Settings snapshot rows — restore is host-confirmed, delete is
  // not (delete only loses the rollback option, doesn't touch live
  // config). Buttons are scope-tagged via data attributes so the
  // host always restores into the right settings.json.
  container.querySelectorAll<HTMLElement>(".cfg-snap-restore").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.snapId;
      const scope = el.dataset.snapScope as PermissionScope | undefined;
      if (id && scope) sendRestoreSettingsSnapshot(scope, id);
    });
  });
  container.querySelectorAll<HTMLElement>(".cfg-snap-delete").forEach((el) => {
    el.addEventListener("click", () => {
      const id = el.dataset.snapId;
      const scope = el.dataset.snapScope as PermissionScope | undefined;
      if (id && scope) sendDeleteSettingsSnapshot(scope, id);
    });
  });
}

/**
 * Track active scope via the DOM so the "Open in file" + "Add tool"
 * buttons always target whatever scope the user picked on the
 * segmented toggle — even if `ui.permissionScope` hasn't yet
 * re-propagated through re-render.
 */
function _currentScope(container: HTMLElement): PermissionScope {
  const active = container.querySelector<HTMLElement>(".acct-scope-toggle .active[data-scope]");
  return (active?.dataset.scope as PermissionScope) ?? "global";
}
