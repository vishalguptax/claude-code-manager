/**
 * Webview entry point -- initialization, message listener, tab system, and mounting.
 *
 * This file is the single entry point bundled by esbuild. It acquires the
 * VS Code API once, initializes the api modules, sends the "ready" signal,
 * and dispatches all incoming messages to the appropriate state updates
 * and view re-renders. Provides a tab bar to switch between Sessions, Skills,
 * Commands, Hooks, MCP, and Agents tabs.
 */

import { icon } from "./icons";
import { sendOpenUrl } from "../features/sessions/webview/api";
import { initApi, sendReady } from "../features/sessions/webview/api";
import { initPersistence } from "./persistence";
import {
  setWorkspacePath,
  setSessions,
  setStats,
  setPinnedIds,
  setDeletedIds,
  setLoading,
  setDetail,
  setFilterDate,
  setFilterProject,
  setRestoreWindowMinutes,
  getView,
  getDetail,
  isShellMounted,
} from "../features/sessions/webview/state";
import type { DateFilter } from "./types";
import { mountShell, updateList, updateFilter, showList } from "../features/sessions/webview/views/listView";
import { showDetail } from "../features/sessions/webview/views/detailView";
import { initSkillsApi, sendGetSkills } from "../features/skills/webview/api";
import {
  setAllSkills,
  setSelectedSkill,
  getSelectedSkill,
  isSkillsShellMounted,
} from "../features/skills/webview/state";
import { mountSkillsShell, updateSkillsList, showSkillsList } from "../features/skills/webview/views/listView";
import { showSkillDetail } from "../features/skills/webview/views/detailView";
import { initCommandsTab, mount as mountCommands, unmount as unmountCommands } from "../features/commands/webview/tab";
import { initHooksTab, mount as mountHooks, unmount as unmountHooks } from "../features/hooks/webview/tab";
import { initMcpTab, mount as mountMcp, unmount as unmountMcp } from "../features/mcp/webview/tab";
import { initAgentsTab, mount as mountAgents, unmount as unmountAgents } from "../features/agents/webview/tab";
import { initAccountTab, mount as mountAccount, unmount as unmountAccount } from "../features/account/webview/tab";
import type { VSCodeAPI, Tab } from "./types";
import type { Session, SessionDetail, Stats, SessionGroup } from "../features/sessions/types";
import type { Skill } from "../features/skills/types";

// ── Tab state ──

let activeTab: Tab = "sessions";
let tabShellMounted = false;

/** All tabs in display order. */
const ALL_TABS: Tab[] = ["sessions", "skills", "commands", "hooks", "mcp", "agents", "account"];

/** Display labels for each tab. */
const TAB_LABELS: Record<Tab, string> = {
  sessions: "Sessions",
  skills: "Skills",
  commands: "Commands",
  hooks: "Hooks",
  mcp: "MCP",
  agents: "Agents",
  account: "Account",
};

/** Lucide icon name for each tab. */
const TAB_ICONS: Record<Tab, string> = {
  sessions: "message-square",
  skills: "sparkles",
  commands: "terminal-square",
  hooks: "webhook",
  mcp: "plug",
  agents: "bot",
  account: "circle-user",
};

// ── Bootstrap ──

declare function acquireVsCodeApi(): VSCodeAPI;
const vscode = acquireVsCodeApi();
initApi(vscode);
initPersistence(vscode);
initSkillsApi(vscode);
initCommandsTab(vscode);
initHooksTab(vscode);
initMcpTab(vscode);
initAgentsTab(vscode);
initAccountTab(vscode);

/**
 * Mount the top-level tab bar and content containers inside the existing #root div.
 * The sessions feature will mount into #sessionsContent and each other feature
 * into its own container. We override getElementById to redirect "root" lookups to
 * the sessions container so existing session code works unchanged.
 */
function mountTabShell(): void {
  const root = document.getElementById("root");
  if (!root) return;

  const tabButtons = ALL_TABS.map(
    (tab) =>
      `<button class="tab-btn ${tab === "sessions" ? "active" : ""}" data-tab="${tab}" role="tab" aria-label="${TAB_LABELS[tab]}" aria-selected="${tab === "sessions" ? "true" : "false"}" tabindex="${tab === "sessions" ? "0" : "-1"}" title="${TAB_LABELS[tab]}"><span class="tab-icon">${icon(TAB_ICONS[tab], 16)}</span><span class="tab-label">${TAB_LABELS[tab]}</span></button>`,
  ).join("");

  const contentDivs = ALL_TABS.map(
    (tab) => `<div id="${tab}Content" class="tab-content ${tab !== "sessions" ? "hidden" : ""}"></div>`,
  ).join("");

  root.innerHTML = `
    <div class="tab-bar-wrap">
      <div id="tabBar" class="tab-bar" role="tablist">${tabButtons}</div>
      <button class="tab-settings-btn" id="openExtSettings" title="Extension settings" aria-label="Extension settings">${icon("settings", 14)}</button>
    </div>
    <div id="tabContentArea" class="tab-content-area">${contentDivs}</div>
    <div class="app-footer">
      <span class="footer-name">Claude Manager</span>
      <span class="footer-links">
        <button class="footer-link" data-url="https://github.com/vishalguptax/claude-code-manager" title="GitHub">${icon("github")}</button>
        <button class="footer-link" data-url="https://www.linkedin.com/in/vishalgupta26/" title="LinkedIn">${icon("linkedin")}</button>
      </span>
    </div>`;

  // Alias skillsRoot -> skillsContent for backward compat with skills feature
  const skillsContent = document.getElementById("skillsContent");
  if (skillsContent) {
    skillsContent.id = "skillsRoot";
  }

  // Bind tab buttons + arrow-key navigation
  const tabButtonEls = Array.from(
    document.querySelectorAll<HTMLElement>(".tab-btn[data-tab]"),
  );
  tabButtonEls.forEach((btn, idx) => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab as Tab;
      switchTab(tab);
    });
    btn.addEventListener("keydown", (e: KeyboardEvent) => {
      let targetIdx = -1;
      if (e.key === "ArrowRight") targetIdx = (idx + 1) % tabButtonEls.length;
      else if (e.key === "ArrowLeft") targetIdx = (idx - 1 + tabButtonEls.length) % tabButtonEls.length;
      else if (e.key === "Home") targetIdx = 0;
      else if (e.key === "End") targetIdx = tabButtonEls.length - 1;
      if (targetIdx >= 0) {
        e.preventDefault();
        const target = tabButtonEls[targetIdx];
        target.focus();
        const tab = target.dataset.tab as Tab;
        switchTab(tab);
      }
    });
  });

  // Bind footer links
  document.querySelectorAll(".footer-link[data-url]").forEach((el) => {
    el.addEventListener("click", () => {
      const url = (el as HTMLElement).dataset.url;
      if (url) sendOpenUrl(url);
    });
  });

  // Extension settings gear — opens VS Code settings filtered to Claude Manager
  document.getElementById("openExtSettings")?.addEventListener("click", () => {
    vscode.postMessage({ type: "openExtensionSettings" });
  });

  tabShellMounted = true;
}

/**
 * Get the sessions content container element.
 * Used to redirect session feature mounts to the correct container.
 */
function getSessionsContainer(): HTMLElement | null {
  return document.getElementById("sessionsContent");
}

/** Track which tab-based features have been mounted at least once. */
const mountedTabs = new Set<Tab>();

/** Mount/unmount lifecycle for tab-based features (commands, hooks, mcp, agents). */
const tabLifecycle: Record<string, { mount: (container: HTMLElement) => void; unmount: () => void }> = {
  commands: { mount: mountCommands, unmount: unmountCommands },
  hooks: { mount: mountHooks, unmount: unmountHooks },
  mcp: { mount: mountMcp, unmount: unmountMcp },
  agents: { mount: mountAgents, unmount: unmountAgents },
  account: { mount: mountAccount, unmount: unmountAccount },
};

/**
 * Switch the active tab and show/hide the corresponding content containers.
 * Lazy-loads tab content on first activation.
 *
 * @param tab - The tab to activate
 */
function switchTab(tab: Tab): void {
  if (tab === activeTab) return;

  // Unmount the previous tab-based feature if it has lifecycle
  if (tabLifecycle[activeTab]) {
    tabLifecycle[activeTab].unmount();
  }

  activeTab = tab;

  // Update tab button styling + a11y attributes
  document.querySelectorAll<HTMLElement>(".tab-btn").forEach((btn) => {
    const isActive = btn.dataset.tab === tab;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.tabIndex = isActive ? 0 : -1;
  });

  // Show/hide content containers
  for (const t of ALL_TABS) {
    const contentId = t === "skills" ? "skillsRoot" : `${t}Content`;
    const el = document.getElementById(contentId);
    if (el) {
      el.classList.toggle("hidden", t !== tab);
    }
  }

  // Handle tab-specific initialization
  if (tab === "skills") {
    if (!isSkillsShellMounted()) {
      sendGetSkills();
    }
  } else if (tabLifecycle[tab]) {
    const container = document.getElementById(`${tab}Content`);
    if (container) {
      tabLifecycle[tab].mount(container);
      mountedTabs.add(tab);
    }
  }
}

// Mount the tab shell first, then redirect #root for session feature compatibility
mountTabShell();

// Patch getElementById so that the sessions feature's lookups for "root"
// are redirected to #sessionsContent. This avoids modifying session code.
const _origGetById = document.getElementById.bind(document);
document.getElementById = function (id: string): HTMLElement | null {
  if (id === "root") {
    return _origGetById("sessionsContent");
  }
  return _origGetById(id);
};

// Then send the ready signal to load sessions
sendReady();

// ── Message handler ──

window.addEventListener("message", (event: MessageEvent) => {
  const msg = event.data as Record<string, unknown>;
  if (!msg || typeof msg.type !== "string") return;

  try {

  // ── Sessions messages ──

  if (msg.type === "workspacePath") {
    setWorkspacePath(msg.data as string);
  } else if (msg.type === "settings") {
    setFilterDate(msg.defaultFilter as DateFilter);
    setFilterProject(msg.defaultProject as string);
    setRestoreWindowMinutes(msg.restoreWindowMinutes as number);
  } else if (msg.type === "sessions") {
    const groups = msg.data as SessionGroup[];
    const flat: Session[] = [];
    for (const g of groups) flat.push(...g.sessions);
    flat.sort((a, b) => b.endTime - a.endTime);
    setSessions(flat);
    setStats(msg.stats as Stats);

    if (getView() === "list") {
      if (!isShellMounted()) mountShell();
      updateList();
      updateFilter();
    }
  } else if (msg.type === "userState") {
    setPinnedIds((msg.pinned as string[] | undefined) || []);
    setDeletedIds((msg.deleted as string[] | undefined) || []);

    if (getView() === "list") updateList();
    if (getView() === "detail" && getDetail()) showDetail();
  } else if (msg.type === "navigateList") {
    showList();

  // ── Skills messages ──

  } else if (msg.type === "skills") {
    const skills = msg.data as Skill[];
    const prevSelected = getSelectedSkill();
    setAllSkills(skills);
    if (!isSkillsShellMounted()) mountSkillsShell();
    // If the selected skill was deleted, go back to the list
    if (prevSelected && !skills.find((s) => s.id === prevSelected.id)) {
      setSelectedSkill(null);
      showSkillsList();
    }
    updateSkillsList();
  } else if (msg.type === "skillDetail") {
    setSelectedSkill(msg.data as Skill);
    showSkillDetail();
  } else if (msg.type === "sessionDetail") {
    setDetail(msg.data as SessionDetail);
    setLoading(false);
    showDetail();
  } else if (msg.type === "error") {
    console.error("[claude-manager]", msg.message);
  }

  } catch (err: unknown) {
    console.error("[claude-manager] Webview message handler error:", err);
  }
});
