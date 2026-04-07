import { icon } from "./icons";

interface VSCodeAPI { postMessage(msg: unknown): void; }
declare function acquireVsCodeApi(): VSCodeAPI;
const vscode = acquireVsCodeApi();

interface Session {
  id: string; name: string; project: string; projectPath: string; branch: string;
  entrypoint: string; startTime: number; endTime: number; messageCount: number;
  summary: string; prompts: string[];
}
interface SessionDetail extends Session {
  messages: { role: "user" | "assistant"; content: string; timestamp: string }[];
}
interface Stats { totalSessions: number; totalProjects: number; thisWeek: number; totalMessages: number; }

let allSessions: Session[] = [];
let stats: Stats = { totalSessions: 0, totalProjects: 0, thisWeek: 0, totalMessages: 0 };
let pinnedIds: Set<string> = new Set();
let deletedIds: Set<string> = new Set();
let selectedId: string | null = null;
let detail: SessionDetail | null = null;
let searchQuery = "";
let loading = false;
let filterProject = "current";
let filterDate: "today" | "week" | "month" | "all" = "today";
let visibleCount = 30;
let workspacePath = "";
let currentProjectName = "";
let view: "list" | "detail" = "list";
let shellMounted = false;

vscode.postMessage({ type: "ready" });

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (msg.type === "workspacePath") {
    workspacePath = msg.data;
    currentProjectName = workspacePath.replace(/\\/g, "/").split("/").filter(Boolean).pop() || "";
    if (!currentProjectName) filterProject = "all";
  } else if (msg.type === "sessions") {
    allSessions = [];
    for (const g of msg.data) allSessions.push(...g.sessions);
    allSessions.sort((a, b) => b.endTime - a.endTime);
    stats = msg.stats;
    if (view === "list") {
      if (!shellMounted) mountShell();
      updateList();
      updateFilter();
    }
  } else if (msg.type === "userState") {
    pinnedIds = new Set(msg.pinned || []);
    deletedIds = new Set(msg.deleted || []);
    if (view === "list") updateList();
    if (view === "detail" && detail) showDetail();
  } else if (msg.type === "navigateList") {
    showList();
  } else if (msg.type === "sessionDetail") {
    detail = msg.data;
    loading = false;
    showDetail();
  }
});

function getFiltered(): Session[] {
  let list = allSessions.filter((s) => !deletedIds.has(s.id));

  if (filterProject === "current" && currentProjectName) {
    list = list.filter((s) => s.project === currentProjectName);
  } else if (filterProject !== "all") {
    list = list.filter((s) => s.project === filterProject);
  }

  if (filterDate !== "all") {
    const now = Date.now();
    const cutoff =
      filterDate === "today" ? dayStart() :
      filterDate === "week" ? now - 7 * 86400000 :
      now - 30 * 86400000;
    list = list.filter((s) => s.endTime >= cutoff || pinnedIds.has(s.id));
  }

  if (searchQuery) {
    list = list.filter((s) =>
      s.project.toLowerCase().includes(searchQuery) ||
      s.branch.toLowerCase().includes(searchQuery) ||
      s.summary.toLowerCase().includes(searchQuery) ||
      s.prompts.some((p) => p.toLowerCase().includes(searchQuery)));
  }

  // Pinned first, then by endTime
  list.sort((a, b) => {
    const ap = pinnedIds.has(a.id) ? 1 : 0;
    const bp = pinnedIds.has(b.id) ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return b.endTime - a.endTime;
  });

  return list;
}

function dayStart(): number { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); }

function getProjects(): string[] {
  const latestActivity = new Map<string, number>();
  for (const s of allSessions) {
    if (deletedIds.has(s.id)) continue;
    const prev = latestActivity.get(s.project) || 0;
    if (s.endTime > prev) latestActivity.set(s.project, s.endTime);
  }
  return [...latestActivity.keys()].sort((a, b) => {
    if (a === currentProjectName) return -1;
    if (b === currentProjectName) return 1;
    return (latestActivity.get(b) || 0) - (latestActivity.get(a) || 0);
  });
}


// ── Mount shell ──
function mountShell() {
  const root = document.getElementById("root")!;
  root.innerHTML = `
    <div class="panel" id="listView">
      <div class="actions-bar">
        <button class="action-btn" id="actNew" title="Start a new Claude session">${icon("plus")} New Session</button>
        <button class="action-btn" id="actLast" title="Resume the most recent session">${icon("play")} Resume Last</button>
        <button class="action-btn" id="actAll" title="Open recent sessions in separate terminals">${icon("split-square-horizontal")} Resume All</button>
        <button class="action-btn icon-only" id="actRefresh" title="Refresh session list">${icon("refresh-cw")}</button>
      </div>
      <div class="search-row">
        <input id="search" type="text" placeholder="Search sessions..." />
        <div class="search-actions">
          <button class="search-btn is-hidden" id="searchClear" title="Clear (Esc)">${icon("x")}</button>
        </div>
      </div>
      <div class="filter-row">
        <div class="dropdown" id="dropdown">
          <button class="dropdown-btn" id="dropdownBtn"><span id="dropdownLabel">All Projects</span>${icon("chevron-down")}</button>
          <div class="dropdown-menu hidden" id="dropdownMenu"></div>
        </div>
      </div>
      <div class="date-chips">
        <button class="chip ${filterDate === "today" ? "active" : ""}" data-date="today">Today</button>
        <button class="chip ${filterDate === "week" ? "active" : ""}" data-date="week">Week</button>
        <button class="chip ${filterDate === "month" ? "active" : ""}" data-date="month">Month</button>
        <button class="chip ${filterDate === "all" ? "active" : ""}" data-date="all">All</button>
      </div>
      <div id="sessionList" class="list"></div>
      <div class="app-footer">
        <span class="footer-name">Claude Code Manager</span>
        <span class="footer-credit">Made by <strong>Vishal</strong></span>
        <span class="footer-links">
          <button class="footer-link" data-url="https://github.com/vishalguptax/claude-code-manager" title="GitHub">${icon("github")}</button>
          <button class="footer-link" data-url="https://www.linkedin.com/in/vishalgupta26/" title="LinkedIn">${icon("linkedin")}</button>
        </span>
      </div>
    </div>
    <div class="panel hidden" id="detailView"></div>`;

  document.getElementById("search")!.addEventListener("input", onSearch);
  document.getElementById("searchClear")!.addEventListener("click", clearSearch);
  document.getElementById("search")!.addEventListener("keydown", (e) => { if (e.key === "Escape") clearSearch(); });
  document.getElementById("dropdownBtn")!.addEventListener("click", () => document.getElementById("dropdownMenu")!.classList.toggle("hidden"));
  document.addEventListener("click", (e) => { if (!document.getElementById("dropdown")!.contains(e.target as Node)) document.getElementById("dropdownMenu")!.classList.add("hidden"); });
  document.getElementById("actNew")!.addEventListener("click", () => vscode.postMessage({ type: "newSession" }));
  document.getElementById("actLast")!.addEventListener("click", () => { const l = getFiltered()[0]; if (l) vscode.postMessage({ type: "resumeSession", sessionId: l.id, entrypoint: l.entrypoint, projectPath: l.projectPath }); });
  document.getElementById("actAll")!.addEventListener("click", () => { const r = getFiltered().slice(0, 3); if (r.length) vscode.postMessage({ type: "resumeMultiple", sessionIds: r.map((s) => s.id), projectPaths: r.map((s) => s.projectPath) }); });
  document.getElementById("actRefresh")!.addEventListener("click", () => vscode.postMessage({ type: "refresh" }));
  document.querySelectorAll(".chip[data-date]").forEach((c) => c.addEventListener("click", () => {
    filterDate = (c as HTMLElement).dataset.date as typeof filterDate;
    visibleCount = 30;
    document.querySelectorAll(".chip[data-date]").forEach((x) => x.classList.remove("active"));
    c.classList.add("active");
    updateList();
  }));
  // Footer links
  document.querySelectorAll(".footer-link[data-url]").forEach((el) => {
    el.addEventListener("click", () => {
      vscode.postMessage({ type: "openUrl", url: (el as HTMLElement).dataset.url });
    });
  });

  shellMounted = true;
}

let searchTimer: ReturnType<typeof setTimeout>;
function onSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const input = document.getElementById("search") as HTMLInputElement;
    searchQuery = input.value.toLowerCase();
    visibleCount = 30;
    document.getElementById("searchClear")!.classList.toggle("is-hidden", !input.value);
    updateList();
  }, 150);
}

function clearSearch() {
  const input = document.getElementById("search") as HTMLInputElement;
  input.value = ""; searchQuery = "";
  document.getElementById("searchClear")!.classList.add("is-hidden");
  updateList(); input.focus();
}

function updateFilter() {
  const menu = document.getElementById("dropdownMenu")!;
  const label = document.getElementById("dropdownLabel")!;
  const projects = getProjects();
  const currentCount = currentProjectName ? allSessions.filter((s) => s.project === currentProjectName && !deletedIds.has(s.id)).length : 0;

  if (filterProject === "current") label.textContent = `This Project (${currentCount})`;
  else if (filterProject === "all") label.textContent = `All Projects (${stats.totalSessions})`;
  else label.textContent = `${filterProject} (${allSessions.filter((s) => s.project === filterProject && !deletedIds.has(s.id)).length})`;

  let h = "";
  if (currentProjectName) h += `<div class="dropdown-item ${filterProject === "current" ? "active" : ""}" data-value="current"><span>This Project</span><span class="dropdown-count">${currentCount}</span></div>`;
  h += `<div class="dropdown-item ${filterProject === "all" ? "active" : ""}" data-value="all"><span>All Projects</span><span class="dropdown-count">${stats.totalSessions}</span></div>`;
  if (projects.length > 0) h += `<div class="dropdown-sep"></div>`;
  for (const p of projects) {
    const count = allSessions.filter((s) => s.project === p && !deletedIds.has(s.id)).length;
    h += `<div class="dropdown-item ${filterProject === p ? "active" : ""}" data-value="${esc(p)}"><span>${esc(p)}</span><span class="dropdown-count">${count}</span></div>`;
  }
  menu.innerHTML = h;
  menu.querySelectorAll(".dropdown-item").forEach((item) => item.addEventListener("click", () => {
    filterProject = (item as HTMLElement).dataset.value!; visibleCount = 30; menu.classList.add("hidden"); updateFilter(); updateList();
  }));
}

// ── Session List ──
function updateList() {
  const container = document.getElementById("sessionList")!;
  const filtered = getFiltered();
  const totalCount = filtered.length;
  const visible = filtered.slice(0, visibleCount);
  const hasMore = totalCount > visibleCount;

  const groups = new Map<string, Session[]>();
  // Separate pinned
  const pinned = visible.filter((s) => pinnedIds.has(s.id));
  const unpinned = visible.filter((s) => !pinnedIds.has(s.id));

  if (pinned.length > 0) groups.set("Pinned", pinned);
  for (const s of unpinned) {
    const l = dateLabel(s.endTime);
    if (!groups.has(l)) groups.set(l, []);
    groups.get(l)!.push(s);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty">${searchQuery ? "No results" : "No sessions"}</div>`;
    return;
  }

  let h = `<div class="list-count">${totalCount} session${totalCount !== 1 ? "s" : ""}</div>`;
  for (const [label, sessions] of groups) {
    h += `<div class="group-label">${esc(label)}</div>`;
    for (const s of sessions) {
      const active = s.id === selectedId;
      const isPinned = pinnedIds.has(s.id);
      const name = s.name || (s.prompts[0] ? (s.prompts[0].length > 50 ? s.prompts[0].slice(0, 50) + "..." : s.prompts[0]) : "Untitled session");
      const branch = s.branch && s.branch !== "HEAD" ? s.branch : "";
      const time = fmtTime(s.endTime);
      const fullName = s.name || s.prompts[0] || "Untitled session";
      const firstPrompt = s.prompts[0] ? (s.prompts[0].length > 40 ? s.prompts[0].slice(0, 40) + "..." : s.prompts[0]) : "";
      const showSubPrompt = s.name && firstPrompt;

      h += `
        <div class="item ${active ? "active" : ""}" data-id="${s.id}">
          <div class="item-row1">
            <span class="item-name" title="${esc(fullName)}">${esc(name)}</span>
            <span class="item-time">${time}</span>
          </div>
          <button class="item-resume" data-resume="${s.id}" title="Resume session">${icon("play")}</button>
          ${showSubPrompt ? `<div class="item-prompt">${esc(firstPrompt)}</div>` : ""}
          <div class="item-row2">
            ${isPinned ? `<span class="pin-icon">${icon("pin")}</span>` : ""}
            ${s.entrypoint === "vscode" ? `<span class="item-ep">ext</span>` : ""}
            ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
            <span class="item-proj">${esc(s.project)}</span>
          </div>
        </div>`;
    }
  }

  if (hasMore) h += `<div class="show-more-row"><button class="show-more-btn" id="showMore">Show more (${totalCount - visibleCount} remaining)</button></div>`;
  container.innerHTML = h;

  document.getElementById("showMore")?.addEventListener("click", () => { visibleCount += 30; updateList(); });

  // List item click → detail
  container.querySelectorAll(".item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest(".item-resume")) return;
      selectedId = (el as HTMLElement).dataset.id!;
      loading = true; showDetail();
      vscode.postMessage({ type: "getSessionDetail", sessionId: selectedId });
    });

    // Right-click context menu
    el.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const id = (el as HTMLElement).dataset.id!;
      const isPinned = pinnedIds.has(id);
      showContextMenu(e as MouseEvent, id, isPinned);
    });
  });

  // Resume button
  container.querySelectorAll("[data-resume]").forEach((btn) => btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const id = (btn as HTMLElement).dataset.resume!;
    const s = allSessions.find((x) => x.id === id);
    if (s) vscode.postMessage({ type: "resumeSession", sessionId: id, entrypoint: s.entrypoint, projectPath: s.projectPath });
  }));
}

// ── Detail View ──
function showDetail() {
  view = "detail";
  document.getElementById("listView")!.classList.add("hidden");
  const dv = document.getElementById("detailView")!;
  dv.classList.remove("hidden");

  if (loading) {
    dv.innerHTML = `<button class="back-btn" id="goBack">${icon("arrow-left")} Back</button><div class="loading">Loading...</div>`;
    dv.querySelector("#goBack")?.addEventListener("click", showList);
    return;
  }
  if (!detail) { showList(); return; }

  const d = detail;
  const date = new Date(d.startTime).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = fmtTime(d.startTime);
  const dur = Math.round((d.endTime - d.startTime) / 60000);
  const branch = d.branch && d.branch !== "HEAD" ? d.branch : "";
  const isDiffProject = currentProjectName && d.project !== currentProjectName;
  const isPinned = pinnedIds.has(d.id);

  dv.innerHTML = `
    <button class="back-btn" id="goBack">${icon("arrow-left")} Back</button>

    <div class="d-head">
      <div class="d-title">${esc(d.name || (d.summary.length > 80 ? d.summary.slice(0, 80) + "..." : d.summary))}</div>
      ${d.name ? `<div class="d-subtitle">${esc(d.summary.length > 80 ? d.summary.slice(0, 80) + "..." : d.summary)}</div>` : ""}
      <div class="d-tags">
        ${branch ? `<span class="tag">${esc(branch)}</span>` : ""}
        <span class="tag folder">${esc(d.project)}</span>
      </div>
      <div class="d-meta">${date} at ${time} · ${dur > 0 ? dur + "m" : "<1m"} · ${d.messageCount} msgs</div>
    </div>

    ${isDiffProject ? `
    <div class="d-notice">
      ${icon("circle-alert")}
      <span>This session belongs to <strong>${esc(d.project)}</strong>. Open that project to resume.</span>
    </div>
    <div class="d-actions">
      <button class="btn primary" id="btnOpenProject">${icon("external-link")} Open ${esc(d.project)}</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>` : `
    <div class="d-actions">
      <button class="btn green" id="btnResume">${icon("play")} Resume</button>
      <button class="btn" id="btnFork">${icon("git-fork")} Fork</button>
      <button class="btn" id="btnPin">${icon(isPinned ? "pin-off" : "pin")} ${isPinned ? "Unpin" : "Pin"}</button>
      <button class="btn" id="btnCopyCmd">${icon("terminal")} Copy Cmd</button>
      <button class="btn del" id="btnDelete">${icon("trash-2")} Delete</button>
    </div>`}

    <div class="d-section">
      <div class="d-label">Info</div>
      <div class="d-kv"><span class="d-k">ID</span><span class="d-v mono">${d.id.slice(0, 18)}...</span></div>
      <div class="d-kv"><span class="d-k">Path</span><span class="d-v mono">${esc(d.project)}</span></div>
      <div class="d-kv"><span class="d-k">Branch</span><span class="d-v">${branch || "—"}</span></div>
    </div>

    ${d.prompts.length ? `
    <div class="d-section">
      <div class="d-label">Prompts (${d.prompts.length})</div>
      ${d.prompts.map((p, i) => `<div class="d-prompt"><span class="d-pn">${i + 1}</span>${esc(p.length > 150 ? p.slice(0, 150) + "..." : p)}</div>`).join("")}
    </div>` : ""}`;

  dv.querySelector("#goBack")?.addEventListener("click", showList);
  dv.querySelector("#btnResume")?.addEventListener("click", () => vscode.postMessage({ type: "resumeSession", sessionId: d.id, entrypoint: d.entrypoint, projectPath: d.projectPath }));
  dv.querySelector("#btnOpenProject")?.addEventListener("click", () => vscode.postMessage({ type: "openProject", projectPath: d.projectPath }));
  dv.querySelector("#btnFork")?.addEventListener("click", () => vscode.postMessage({ type: "forkSession", sessionId: d.id }));
  dv.querySelector("#btnCopyCmd")?.addEventListener("click", () => { vscode.postMessage({ type: "copyCommand", sessionId: d.id }); flash("btnCopyCmd", "Copied!"); });
  dv.querySelector("#btnPin")?.addEventListener("click", () => {
    vscode.postMessage({ type: isPinned ? "unpinSession" : "pinSession", sessionId: d.id });
  });
  dv.querySelector("#btnDelete")?.addEventListener("click", () => {
    confirmDelete(d.id, () => showList());
  });
}

// ── Context Menu ──
function showContextMenu(e: MouseEvent, sessionId: string, isPinned: boolean) {
  closeContextMenu();
  const menu = document.createElement("div");
  menu.className = "ctx-menu";
  menu.id = "ctxMenu";
  menu.innerHTML = `
    <div class="ctx-item" data-action="pin"><span class="ctx-icon">${icon(isPinned ? "pin-off" : "pin")}</span>${isPinned ? "Unpin" : "Pin to top"}</div>
    <div class="ctx-item" data-action="fork"><span class="ctx-icon">${icon("git-fork")}</span>Fork &amp; Resume</div>
    <div class="ctx-item" data-action="copyCmd"><span class="ctx-icon">${icon("terminal")}</span>Copy resume command</div>
    <div class="ctx-item" data-action="copyId"><span class="ctx-icon">${icon("copy")}</span>Copy session ID</div>
    <div class="ctx-sep"></div>
    <div class="ctx-item del" data-action="delete"><span class="ctx-icon">${icon("trash-2")}</span>Delete session</div>
  `;

  document.body.appendChild(menu);

  // Position: make sure it doesn't overflow
  const rect = document.body.getBoundingClientRect();
  let x = e.clientX, y = e.clientY;
  menu.style.left = x + "px";
  menu.style.top = y + "px";

  // Adjust if overflows
  requestAnimationFrame(() => {
    const mr = menu.getBoundingClientRect();
    if (mr.right > rect.right) menu.style.left = (x - mr.width) + "px";
    if (mr.bottom > rect.bottom) menu.style.top = (y - mr.height) + "px";
  });

  menu.querySelectorAll(".ctx-item").forEach((item) => {
    item.addEventListener("click", () => {
      const action = (item as HTMLElement).dataset.action;
      switch (action) {
        case "pin":
          vscode.postMessage({ type: isPinned ? "unpinSession" : "pinSession", sessionId });
          break;
        case "fork":
          vscode.postMessage({ type: "forkSession", sessionId });
          break;
        case "copyCmd":
          vscode.postMessage({ type: "copyCommand", sessionId });
          break;
        case "copyId":
          navigator.clipboard?.writeText(sessionId);
          break;
        case "delete":
          confirmDelete(sessionId);
          break;
      }
      closeContextMenu();
    });
  });

  // Close on click outside
  setTimeout(() => {
    document.addEventListener("click", closeContextMenu, { once: true });
  }, 0);
}

function closeContextMenu() {
  document.getElementById("ctxMenu")?.remove();
}

function confirmDelete(sessionId: string, onDone?: () => void) {
  closeContextMenu();
  vscode.postMessage({ type: "confirmDelete", sessionId, callback: onDone ? "showList" : undefined });
}

function showList() {
  view = "list";
  document.getElementById("detailView")!.classList.add("hidden");
  document.getElementById("listView")!.classList.remove("hidden");
  updateList();
}

function flash(id: string, text: string) {
  const b = document.getElementById(id);
  if (!b) return;
  const orig = b.textContent;
  b.textContent = text;
  setTimeout(() => { b.textContent = orig; }, 1200);
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function dateLabel(ts: number): string {
  const now = new Date(), d = new Date(ts);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (d >= today) return "Today";
  if (d >= new Date(today.getTime() - 86400000)) return "Yesterday";
  if (d >= new Date(today.getTime() - 7 * 86400000)) return "This Week";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function esc(t: string): string { const d = document.createElement("div"); d.textContent = t; return d.innerHTML; }
