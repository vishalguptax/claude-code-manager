#!/usr/bin/env node
// Generates the 8 site screenshots as HTML mocks mirroring the REAL v2
// extension UI (structures verified against Downloads/cm ss captures) with
// fresh dummy data, recolored to the site's near-black + clay palette.
// Render each at 1520x2256 (2x of 760x1128) with headless Edge and overwrite
// site/assets/screenshots/NN-*.png.

import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "_mock-tmp");

const CSS = `
  :root{
    --bg:#101014; --surface:#17171c; --surface-2:#1f1f25; --inset:#0b0b0e;
    --border:#26262d; --border-soft:#1d1d23;
    --text:#f5f5f7; --muted:#9a9aa3; --dim:#5f5f69;
    --clay:#e8a187; --clay-deep:#d97757; --clay-tint:rgba(217,119,87,.16);
    --clay-ink:#2a140b; --green:#57b88a; --red:#cf5f55; --yellow:#cfae3f;
  }
  *{box-sizing:border-box;margin:0;padding:0}
  html{font-size:64px}
  body{
    width:23.75rem;height:35.25rem;background:var(--bg);color:var(--text);
    font-family:"Segoe UI",system-ui,sans-serif;font-size:.78rem;line-height:1.5;
    -webkit-font-smoothing:antialiased;overflow:hidden;display:flex;flex-direction:column;
  }
  .mono{font-family:Consolas,"Cascadia Code",monospace}
  /* chrome */
  .hd{padding:.6rem 1rem .45rem;font-size:.72rem;font-weight:600;letter-spacing:.05em}
  .tabs{display:flex;align-items:center;gap:.05rem;padding:0 .55rem;border-bottom:1px solid var(--border-soft)}
  .tab{display:flex;align-items:center;gap:.4rem;padding:.55rem .5rem;color:var(--dim);font-size:.8rem;font-weight:600;border-bottom:2px solid transparent;position:relative;top:1px}
  .tab.on{color:var(--text);border-bottom-color:var(--clay-deep)}
  .tab svg{width:1rem;height:1rem}
  .tabs .sp{flex:1}
  .rficon{color:var(--dim);padding:.55rem .3rem}
  .rficon svg{width:.95rem;height:.95rem}
  .content{flex:1;padding:.75rem 1rem;display:flex;flex-direction:column;gap:.55rem;overflow:hidden}
  .foot{display:flex;align-items:center;justify-content:space-between;padding:.55rem 1rem;border-top:1px solid var(--border-soft);font-size:.74rem;font-weight:600}
  .foot .ics{display:flex;gap:.6rem;color:var(--dim)}
  .foot svg{width:.85rem;height:.85rem}
  /* shared */
  .row{display:flex;align-items:center;gap:.5rem}
  .grow{flex:1;min-width:0}
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:.4rem;background:var(--surface);border:1px solid var(--border);border-radius:.34rem;padding:.46rem .7rem;font-size:.76rem;font-weight:500;color:var(--text)}
  .btn svg{width:.8rem;height:.8rem;color:var(--muted)}
  .btn.danger{color:var(--red)} .btn.danger svg{color:var(--red)}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:.45rem}
  .search{display:flex;align-items:center;gap:.45rem}
  .search .inp{flex:1;display:flex;align-items:center;gap:.45rem;background:var(--surface);border:1px solid var(--border-soft);border-radius:.36rem;padding:.5rem .7rem;color:var(--dim)}
  .search .inp svg{width:.8rem;height:.8rem}
  .sq{width:2.15rem;height:2.15rem;border-radius:.36rem;background:var(--surface);border:1px solid var(--border-soft);display:grid;place-items:center;color:var(--muted);flex:none}
  .sq svg{width:.85rem;height:.85rem}
  .drop{flex:1;display:flex;align-items:center;justify-content:space-between;gap:.4rem;background:var(--surface);border:1px solid var(--border-soft);border-radius:.36rem;padding:.5rem .7rem;font-size:.76rem}
  .drop svg{width:.8rem;height:.8rem;color:var(--dim);flex:none}
  .seg{display:flex;background:var(--surface);border:1px solid var(--border-soft);border-radius:.4rem;padding:.14rem}
  .seg span{flex:1;text-align:center;padding:.36rem .4rem;border-radius:.3rem;color:var(--muted);font-size:.74rem;white-space:nowrap}
  .seg span.on{background:var(--clay-deep);color:#fff;font-weight:600}
  .countrow{display:flex;align-items:center;justify-content:space-between}
  .count{color:var(--dim);font-size:.72rem}
  .select{display:inline-flex;align-items:center;gap:.3rem;border:1px solid var(--border);border-radius:.3rem;padding:.22rem .55rem;color:var(--muted);font-size:.7rem}
  .grp{color:var(--text);font-size:.7rem;font-weight:700;letter-spacing:.06em;margin-top:.3rem}
  .item{padding:.5rem .55rem;margin:0 -.55rem;border-radius:.3rem}
  .item:nth-child(even){background:rgba(255,255,255,.022)}
  .item h4{font-size:.84rem;font-weight:600}
  .item .tm{color:var(--dim);font-size:.7rem;flex:none}
  .item .sub{color:var(--muted);font-size:.73rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:.12rem 0 .22rem}
  .chip{display:inline-block;padding:.13rem .5rem;border-radius:.28rem;font-size:.64rem;font-weight:600}
  .chip.branch{background:var(--surface-2);color:var(--muted);font-family:Consolas,monospace;border:1px solid var(--border)}
  .chip.green{background:rgba(87,184,138,.15);color:var(--green)}
  .chip.tint{background:var(--clay-tint);color:var(--clay)}
  .chip.dimc{background:var(--surface-2);color:var(--muted)}
  .chip.red{background:rgba(207,95,85,.15);color:var(--red)}
  .proj{color:var(--muted);font-size:.72rem}
  .dotlive{width:.38rem;height:.38rem;border-radius:50%;background:var(--green);flex:none}
  .copyic{width:1.35rem;height:1.35rem;border-radius:.28rem;border:1px solid var(--border);display:grid;place-items:center;color:var(--dim);flex:none}
  .copyic svg{width:.7rem;height:.7rem}
  .pinic{color:var(--dim);width:.85rem;flex:none}
  .pinic svg{width:.85rem;height:.85rem}
  .item.sel{background:var(--surface);outline:1px solid var(--border);border-radius:.34rem}
  .actions{display:flex;gap:.35rem;margin-top:.4rem;flex-wrap:wrap}
  .act{display:inline-flex;align-items:center;gap:.3rem;background:var(--surface-2);border:1px solid var(--border);border-radius:.3rem;padding:.26rem .55rem;font-size:.66rem;font-weight:600;color:var(--text)}
  .act svg{width:.65rem;height:.65rem;color:var(--muted)}
  .act.primary{background:var(--clay-deep);border-color:var(--clay-deep);color:#fff}
  .act.primary svg{color:#fff}
  .toggle{width:1.6rem;height:.88rem;border-radius:99px;background:var(--surface-2);border:1px solid var(--border);position:relative;flex:none}
  .toggle i{position:absolute;top:.09rem;left:.1rem;width:.6rem;height:.6rem;border-radius:50%;background:var(--dim)}
  .toggle.on{background:var(--clay-tint);border-color:var(--clay-deep)}
  .toggle.on i{left:auto;right:.1rem;background:var(--clay-deep)}
  .kv{display:flex;justify-content:space-between;align-items:center;padding:.3rem 0;font-size:.78rem}
  .kv b{font-weight:600} .kv .k{color:var(--muted)}
  .lbl{color:var(--muted);font-size:.74rem;margin-bottom:.2rem}
  .field{display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border-soft);border-radius:.36rem;padding:.5rem .7rem;font-size:.78rem}
  .field svg{width:.8rem;height:.8rem;color:var(--dim)}
  .tiles{display:flex;gap:.45rem}
  .tile{flex:1;background:var(--surface);border:1px solid var(--border-soft);border-radius:.4rem;text-align:center;padding:.55rem 0}
  .tile b{display:block;font-size:.95rem;font-weight:700}
  .tile span{color:var(--dim);font-size:.56rem;font-weight:600;letter-spacing:.06em}
  .sect{display:flex;align-items:center;gap:.4rem;color:var(--text);font-size:.74rem;font-weight:700;letter-spacing:.05em;margin-top:.25rem}
  .sect svg{width:.75rem;height:.75rem;color:var(--dim)}
  .sect .ago{margin-left:auto;color:var(--dim);font-weight:400;font-size:.68rem}
  .qbar{height:.42rem;border-radius:99px;background:var(--surface-2);overflow:hidden;margin:.22rem 0 .1rem}
  .qbar i{display:block;height:100%;border-radius:99px}
  .resets{color:var(--dim);font-size:.66rem}
  .banner{background:var(--clay-tint);border:1px solid rgba(217,119,87,.35);border-radius:.4rem;padding:.5rem .7rem;display:flex;gap:.5rem;align-items:flex-start}
  .banner svg{width:.85rem;height:.85rem;color:var(--clay);flex:none;margin-top:.1rem}
  .banner p{color:var(--clay);font-size:.72rem;line-height:1.45}
`;

const IC = {
  chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></svg>',
  term: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="m8 9 3 3-3 3M13 15h4"/></svg>',
  hook: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a5 5 0 0 0-10 0v7a3 3 0 0 0 6 0v-6"/></svg>',
  plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22v-5"/><path d="M9 8V2M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/></svg>',
  bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M15 13v2M9 13v2"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 21a7 7 0 0 1 14 0"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  ghost: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"/></svg>',
  hist: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/></svg>',
  cols: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>',
  imp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5"/><path d="M21 21H3"/></svg>',
  rf: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
  globe: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20z"/></svg>',
  srch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
  branch: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5M9 10.8 7.5 12.3a2 2 0 0 0-.5 1.4V15h10v-1.3a2 2 0 0 0-.5-1.4L15 10.8V5h1V3H8v2h1z"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  gh: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.2-3.4-1.2-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.3-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7 3.6 3.6 0 0 1 .1-2.7s.8-.3 2.7 1a9.4 9.4 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .5 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .4.3.7.9.7 1.9v2.8c0 .3.2.6.7.5A10 10 0 0 0 12 2z"/></svg>',
  li: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.5 8h4V24h-4zM8.5 8h3.8v2.2h.1c.5-1 1.8-2.2 3.8-2.2 4 0 4.8 2.7 4.8 6.1V24h-4v-8.5c0-2-.04-4.7-2.9-4.7-2.9 0-3.3 2.2-3.3 4.5V24h-4z"/></svg>',
};

const TABS = [
  ["chat", "Sessions"], ["spark", "Skills"], ["term", "Commands"], ["hook", "Hooks"],
  ["plug", "MCP"], ["bot", "Agents"], ["user", "Account"], ["gear", "Config"],
];

function chrome(active, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
  <div class="hd">CLAUDE CODE MANAGER</div>
  <div class="tabs">
    ${TABS.map(([ic, label]) => `<span class="tab${label === active ? " on" : ""}">${IC[ic]}${label === active ? `<span>${label}</span>` : ""}</span>`).join("")}
    <span class="sp"></span><span class="rficon">${IC.rf}</span>
  </div>
  <div class="content">${body}</div>
  <div class="foot"><span>Claude Code Manager</span><span class="ics">${IC.gh}${IC.li}</span></div>
  </body></html>`;
}

const search = (ph, { globe = false } = {}) =>
  `<div class="search"><span class="inp">${IC.srch}<span>${ph}</span></span>${globe ? `<span class="sq">${IC.globe}</span>` : ""}<span class="sq">${IC.rf}</span></div>`;

const sess = (t, time, sub, branch, proj, { live = false, pin = false } = {}) => `
  <div class="item">
    <div class="row">${live ? '<span class="dotlive"></span>' : ""}<h4 class="grow">${t}</h4><span class="tm">${time}</span></div>
    <div class="sub">${sub}</div>
    <div class="row"><span class="chip branch">${branch}</span><span class="proj grow">${proj}</span>${pin ? `<span class="pinic">${IC.pin}</span>` : ""}</div>
  </div>`;

const listed = (name, chip, chipCls, sub, { mono = false } = {}) => `
  <div class="item">
    <div class="row"><h4 class="grow${mono ? " mono" : ""}">${name}</h4><span class="copyic">${IC.copy}</span><span class="chip ${chipCls}">${chip}</span></div>
    <div class="sub">${sub}</div>
  </div>`;

const PANELS = {
  "01-sessions": chrome("Sessions", `
    <div class="grid2">
      <span class="btn">${IC.plus} New</span><span class="btn">${IC.ghost} Temp</span>
      <span class="btn">${IC.hist} Continue</span><span class="btn">${IC.cols} Restore Workspace</span>
    </div>
    ${search("Search sessions…")}
    <div class="row">
      <span class="drop"><span>This Project</span>${IC.chev}</span>
      <span class="drop"><span class="row" style="gap:.35rem">${IC.branch} All Branches</span>${IC.chev}</span>
    </div>
    <div class="seg"><span class="on">Recent</span><span>Week</span><span>Month</span><span>All</span></div>
    <div class="countrow"><span class="count">23 sessions</span><span class="select">${IC.check} Select</span></div>
    <div class="grp">ACTIVE</div>
    <div class="item sel">
      <div class="row"><span class="dotlive"></span><h4 class="grow">Ship payment retry queue</h4><span class="tm">now</span></div>
      <div class="sub">add exponential backoff to the webhook retries, cap at 6 attempts, dead-letter after…</div>
      <div class="row"><span class="chip branch">feat/retry-queue</span><span class="proj grow">acme-billing</span></div>
      <div class="actions">
        <span class="act primary">${IC.hist} Resume</span>
        <span class="act">${IC.branch} Fork</span>
        <span class="act">${IC.copy} Export</span>
        <span class="act">${IC.pin} Pin</span>
        <span class="act">Rename</span>
      </div>
    </div>
    <div class="grp">PINNED</div>
    ${sess("Plan v3 session indexing", "2d", "the JSONL scan is O(n) per open — index by project + mtime, keep raw files as sourc…", "main", "acme-billing", { pin: true })}
    ${sess("Fix flaky e2e suite", "8d", "playwright timeouts on CI only, likely the seeded clock drifting between specs — pin…", "fix/e2e-clock", "acme-web", { pin: true })}
    <div class="grp">JUNE 2026</div>
    ${sess("Webhook signature rotation", "3d", "support two active signing secrets during rotation so deploys don't drop events…", "feat/key-rotation", "acme-billing")}
    ${sess("Dark-mode contrast audit", "9d", "muted text fails 4.5:1 on tinted surfaces, bump the ramp two steps and re-run axe…", "v2-final", "acme-web")}
  `),

  "02-skills": chrome("Skills", `
    ${search("Search skills…", { globe: true })}
    <div class="seg"><span class="on">All (22)</span><span>Project (15)</span><span>Global (2)</span><span>Plugin (5)</span></div>
    <div class="count">22 skills</div>
    <div class="grp">PROJECT</div>
    <div class="item sel">
      <div class="row"><h4 class="grow">release</h4><span class="copyic">${IC.copy}</span><span class="chip green">project</span></div>
      <div class="sub">Curate a release — analyze commits since last tag, categorize, bump version, update…</div>
      <div class="actions">
        <span class="act primary">${IC.term} Launch in Claude</span>
        <span class="act">${IC.copy} Copy</span>
        <span class="act">${IC.ext} Open file</span>
      </div>
    </div>
    ${listed("code-review", "project", "green", "Review the current diff for correctness bugs and reuse / simplification cleanups at…")}
    ${listed("backend-conventions", "project", "green", "Extension-host conventions. Covers src/extension, src/core, and feature parsers.")}
    ${listed("frontend-design", "project", "green", "Create distinctive, production-grade frontend interfaces with high design quality.")}
    ${listed("impeccable", "project", "green", "Use when the user wants to design, redesign, shape, critique, audit, polish, or other…")}
    <div class="grp">GLOBAL</div>
    ${listed("deep-research", "global", "dimc", "Fan out web searches, adversarially verify claims, synthesize a cited report.")}
    <div class="grp">PLUGIN</div>
    ${listed("caveman", "plugin", "tint", "Ultra-compressed communication mode. Cuts token usage ~75% while keeping…")}
  `),

  "03-commands": chrome("Commands", `
    ${search("Search commands…")}
    <div class="seg"><span class="on">All (55)</span><span>Built-in (52)</span><span>Global (0)</span><span>Plugin (3)</span></div>
    <div class="count">55 commands</div>
    <div class="grp">BUILT-IN</div>
    <div class="item sel">
      <div class="row"><h4 class="grow mono">/agents</h4><span class="copyic">${IC.copy}</span><span class="chip dimc">builtin</span></div>
      <div class="sub">Manage agent configurations</div>
      <div class="actions">
        <span class="act primary">${IC.term} Launch in chat</span>
        <span class="act">${IC.copy} Copy command</span>
      </div>
    </div>
    ${listed("/branch", "builtin", "dimc", "Create a branch of the conversation (alias: /fork)", { mono: true })}
    ${listed("/compact", "builtin", "dimc", "Compact conversation with optional focus", { mono: true })}
    ${listed("/context", "builtin", "dimc", "Visualize current context usage", { mono: true })}
    ${listed("/review", "builtin", "dimc", "Review a pull request", { mono: true })}
    <div class="grp">PLUGIN</div>
    ${listed("/caveman:compress", "plugin", "tint", "Compress memory files into terse format to save input tokens", { mono: true })}
    ${listed("/impeccable:craft", "plugin", "tint", "Shape, then build a feature end-to-end with studio-grade quality", { mono: true })}
  `),

  "04-hooks": chrome("Hooks", `
    ${search("Search hooks…")}
    <div class="count">6 hooks · 5 enabled</div>
    <div class="grp">GLOBAL — ~/.claude/settings.json</div>
    <div class="item"><div class="row"><h4 class="grow">SessionStart</h4><span class="chip dimc">global</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">track-session.sh --record {sessionId} → active-sessions.json</div></div>
    <div class="item"><div class="row"><h4 class="grow">PreToolUse · Bash</h4><span class="chip dimc">global</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">block-destructive.sh — guards rm -rf and force-push on main</div></div>
    <div class="grp">PROJECT — .claude/settings.json</div>
    <div class="item"><div class="row"><h4 class="grow">PostToolUse · Edit</h4><span class="chip green">project</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">npx biome check --write {file} && npx tsc --noEmit</div></div>
    <div class="item"><div class="row"><h4 class="grow">Stop</h4><span class="chip green">project</span><span class="toggle"><i></i></span></div>
      <div class="sub mono">notify-send "Claude finished" --icon=dialog-information</div></div>
    <div class="grp">LOCAL — .claude/settings.local.json</div>
    <div class="item"><div class="row"><h4 class="grow">UserPromptSubmit</h4><span class="chip tint">local</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">inject-context.sh --branch --recent-failures</div></div>
  `),

  "05-mcp": chrome("MCP", `
    <div class="banner">${IC.warn}<p>2 MCP connectors need re-auth: claude.ai Figma, claude.ai Slack</p></div>
    ${search("Search servers…", { globe: true })}
    <div class="count">5 servers · 4 enabled</div>
    <div class="grp">GLOBAL — ~/.claude/mcp.json</div>
    <div class="item"><div class="row"><span class="dotlive"></span><h4 class="grow">github</h4><span class="chip tint">STDIO</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">npx @modelcontextprotocol/server-github · GITHUB_TOKEN=ghp_••••••••</div></div>
    <div class="item"><div class="row"><span class="dotlive"></span><h4 class="grow">postgres-prod</h4><span class="chip tint">STDIO</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">mcp-postgres --readonly · DSN=postgres://app:••••••@db.internal:5432</div></div>
    <div class="item"><div class="row"><span class="dotlive" style="background:var(--red)"></span><h4 class="grow">figma</h4><span class="chip dimc">HTTP</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">https://mcp.figma.com · OAuth expired 2 days ago</div></div>
    <div class="item"><div class="row"><span class="dotlive" style="background:var(--dim)"></span><h4 class="grow">playwright</h4><span class="chip tint">STDIO</span><span class="toggle"><i></i></span></div>
      <div class="sub mono">npx @playwright/mcp · disabled</div></div>
    <div class="grp">PROJECT — .mcp.json</div>
    <div class="item"><div class="row"><span class="dotlive"></span><h4 class="grow">internal-docs</h4><span class="chip green">PROJECT</span><span class="toggle on"><i></i></span></div>
      <div class="sub mono">node tools/docs-mcp.mjs · indexes ./docs + ./adr</div></div>
  `),

  "06-agents": chrome("Agents", `
    ${search("Search agents…")}
    <div class="seg"><span class="on">All (5)</span><span>Project (4)</span><span>Plugin (1)</span></div>
    <div class="count">5 agents</div>
    <div class="grp">PROJECT</div>
    ${listed("backend", "Opus", "tint", "Extension-host implementation: parsers, state, commands, viewProvider.")}
    ${listed("frontend", "Opus", "tint", "Webview implementation: browser DOM, CSS, postMessage contracts.")}
    ${listed("verifier", "Sonnet", "dimc", "Read-only reviewer for scope verification. Cannot edit files — enforced mechanically.")}
    ${listed("test-architect", "Sonnet", "dimc", "Scaffolds acceptance tests from scope requirements before the build starts.")}
    <div class="grp">PLUGIN</div>
    ${listed("quick-fix", "Haiku", "green", "Small mechanical edits: renames, moves, single-file refactors. Fast and cheap.")}
  `),

  "07-account": chrome("Account", `
    <div class="sect">${IC.chev} PROFILE</div>
    <div class="row" style="gap:.7rem">
      <span style="width:2.3rem;height:2.3rem;border-radius:50%;background:var(--clay-deep);color:#fff;display:grid;place-items:center;font-weight:700;font-size:1rem">V</span>
      <div class="grow"><b style="font-size:.9rem">Vishal</b><div style="color:var(--muted);font-size:.72rem">vishal@example.dev</div></div>
      <span class="chip tint" style="border:1px solid rgba(217,119,87,.4);font-weight:700">MAX</span>
    </div>
    <div class="grid2">
      <span class="btn">${IC.rf} Switch account</span><span class="btn danger">${IC.x} Log out</span>
    </div>
    <div class="sect">${IC.chev} QUOTA <span class="ago">41s ago</span></div>
    <div>
      <div class="kv" style="padding:.1rem 0"><b>5-hour window</b><b>11%</b></div>
      <div class="qbar"><i style="width:11%;background:var(--green)"></i></div><span class="resets">resets in 4h 47m</span>
    </div>
    <div>
      <div class="kv" style="padding:.1rem 0"><b>7-day window</b><b>73%</b></div>
      <div class="qbar"><i style="width:73%;background:var(--yellow)"></i></div><span class="resets">resets in 1d 9h</span>
    </div>
    <div class="sect">${IC.chev} USAGE</div>
    <div class="seg"><span>7 days</span><span class="on">30 days</span><span>All time</span></div>
    <div style="display:flex;gap:.5rem;color:var(--dim);font-size:.6rem;padding:0 .1rem"><span style="flex:1">MAR</span><span style="flex:1">APR</span><span style="flex:1">MAY</span><span style="flex:1">JUN</span></div>
    <div style="display:grid;grid-template-columns:repeat(26,1fr);gap:.12rem">${Array.from({ length: 130 }, (_, i) => {
      const s = Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.43));
      const v = s < 0.16 ? 0 : s < 0.42 ? 0.25 : s < 0.68 ? 0.5 : s < 0.88 ? 0.75 : 1;
      return `<span style="aspect-ratio:1;border-radius:.1rem;background:${v === 0 ? "var(--surface-2)" : `rgba(232,161,135,${0.16 + v * 0.72})`}"></span>`;
    }).join("")}</div>
    <div class="tiles">
      <div class="tile"><b>43.3M</b><span>TOKENS</span></div>
      <div class="tile"><b>133</b><span>SESSIONS</span></div>
      <div class="tile"><b>45.0K</b><span>MESSAGES</span></div>
      <div class="tile"><b>87%</b><span>CACHE HIT</span></div>
    </div>
    <div class="count">Favorite: Opus 4.8 · 23/30 active · streak 6d · best 19d</div>
  `),

  "08-config": chrome("Config", `
    <div class="sect">${IC.gear.replace('width:.75rem', '')} BEHAVIOR</div>
    <div><div class="lbl">Model</div><div class="field"><span class="mono">claude-opus-4-8</span>${IC.chev}</div></div>
    <div><div class="lbl">Tool-use confirmation</div><div class="field"><span>Use CLI default</span>${IC.chev}</div></div>
    <div><div class="lbl">Reasoning effort</div><div class="field"><span>High</span>${IC.chev}</div></div>
    <div class="kv"><span class="k">"Co-authored-by: Claude" in commits</span><span class="toggle on"><i></i></span></div>
    <div class="kv"><span class="k">Session retention</span><b>Unlimited</b></div>
    <div class="grid2">
      <span class="btn">${IC.ext} Open settings.json</span><span class="btn">${IC.term} Open /config</span>
      <span class="btn">${IC.gear} Extension settings</span><span class="btn danger">${IC.rf} Reset settings</span>
    </div>
    <div class="sect">PERMISSIONS</div>
    <div class="seg"><span class="on">Global</span><span>Project</span><span>Local</span></div>
    <div class="item"><div class="row"><span class="chip green">allow</span><span class="sub grow mono" style="margin:0">Bash(npm test:*) · Bash(git diff:*) · Read(src/**)</span></div></div>
    <div class="item"><div class="row"><span class="chip red">deny</span><span class="sub grow mono" style="margin:0">Bash(rm -rf:*) · WebFetch(*)</span></div></div>
    <div class="sect">SETTINGS HISTORY</div>
    <div class="item"><div class="row"><h4 class="grow">Today 14:02</h4><span class="btn" style="padding:.25rem .6rem">Restore</span></div>
      <div class="sub">model: sonnet → opus · +2 allow rules</div></div>
  `),
};

await mkdir(OUT, { recursive: true });
for (const [name, html] of Object.entries(PANELS)) {
  await writeFile(join(OUT, `${name}.html`), html);
  console.log(`wrote ${name}.html`);
}
console.log(`\nRender at 1520x2256 to PNG, then convert to lossless WebP (sharp
.webp({lossless:true,effort:6})) into site/assets/screenshots/ — the site
references .webp only.`);
