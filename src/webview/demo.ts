/**
 * Cinematic Easter egg overlay.
 *
 * Full-viewport terminal-flavoured boot animation that plays once on a
 * user's first webview mount, and on demand via a triple-click on the
 * footer brand text. Independent of any tab's DOM — renders a fixed
 * position overlay on top of the sidebar so it works from any state.
 *
 * Content is intentionally brand-atmospheric (tagline / principles /
 * feature categories) rather than version-specific so it doesn't need
 * updates per release.
 *
 * Layout is tuned for a 400–450px sidebar — short lines, compact
 * monograms, scrollable overlay so nothing clips.
 */

import { getPersisted, setPersisted } from "./persistence";

const DEMO_SEEN_KEY = "demoSeen";

/**
 * Full Claude + Manager wordmarks, stacked. Manager intentionally
 * rendered in the same heavy block font as Claude so neither word
 * feels demoted. Sized for a narrow sidebar at ~8.5px font — still
 * fits cleanly inside 400–450px after padding.
 */
const LOGO_LINES = [
  "",
  "   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗",
  "  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝",
  "  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  ",
  "  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ",
  "  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗",
  "   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝",
  "",
  " ███╗   ███╗ █████╗ ███╗   ██╗ █████╗  ██████╗ ███████╗██████╗ ",
  " ████╗ ████║██╔══██╗████╗  ██║██╔══██╗██╔════╝ ██╔════╝██╔══██╗",
  " ██╔████╔██║███████║██╔██╗ ██║███████║██║  ███╗█████╗  ██████╔╝",
  " ██║╚██╔╝██║██╔══██║██║╚██╗██║██╔══██║██║   ██║██╔══╝  ██╔══██╗",
  " ██║ ╚═╝ ██║██║  ██║██║ ╚████║██║  ██║╚██████╔╝███████╗██║  ██║",
  " ╚═╝     ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝",
  "",
];

/**
 * Boot lines — mix real steps with a few deadpan ones to keep it
 * playful without being try-hard. No version numbers. No dated
 * feature claims. Feature list below stays at category granularity
 * so it survives every release without edits.
 */
const BOOT_LINES: Array<{
  delay: number;
  text: string;
  tone?: "ok" | "dim" | "brand" | "prompt" | "head" | "hint" | "accent" | "cmd";
}> = [
  { delay: 0,    text: "$ booting claude-manager", tone: "cmd" },
  { delay: 200,  text: "  ▸ reading ~/.claude/", tone: "ok" },
  { delay: 340,  text: "  ▸ indexing your sessions", tone: "ok" },
  { delay: 480,  text: "  ▸ loading skills + commands", tone: "ok" },
  { delay: 620,  text: "  ▸ mounting the sidebar", tone: "ok" },
  { delay: 820,  text: "" },
  { delay: 900,  text: "   ready.", tone: "accent" },
  { delay: 1140, text: "" },

  { delay: 1220, text: "  what it does", tone: "head" },
  { delay: 1340, text: "    every session, indexed and one click away", tone: "hint" },
  { delay: 1460, text: "    skills, commands, hooks, agents — browsable", tone: "hint" },
  { delay: 1580, text: "    swap between Claude accounts at will", tone: "hint" },
  { delay: 1700, text: "    your whole setup, portable as a .zip", tone: "hint" },
  { delay: 1820, text: "    tokens spent, visible at a glance", tone: "hint" },
  { delay: 1940, text: "    permissions + effort + MCP — no JSON to edit", tone: "hint" },
  { delay: 2120, text: "" },

  { delay: 2220, text: "  the vibe", tone: "head" },
  { delay: 2340, text: "    no more grep | awk | regret", tone: "hint" },
  { delay: 2460, text: "    refuses to call home", tone: "hint" },
  { delay: 2580, text: "    pretends to be local. actually is local.", tone: "hint" },
  { delay: 2700, text: "    all killer, no filler", tone: "hint" },
  { delay: 2820, text: "    the terminal never had it this good.", tone: "accent" },
  { delay: 3040, text: "" },

  { delay: 3140, text: "  the promise", tone: "head" },
  { delay: 3260, text: "    · 100% local       data stays on disk", tone: "hint" },
  { delay: 3380, text: "    · zero telemetry   nothing phones home", tone: "hint" },
  { delay: 3500, text: "    · zero accounts    install → done", tone: "hint" },
  { delay: 3620, text: "    · open source      Apache 2.0", tone: "hint" },
  { delay: 3820, text: "" },

  { delay: 3920, text: "  shortcuts", tone: "head" },
  { delay: 4040, text: "    Ctrl+Alt+C            open the sidebar", tone: "hint" },
  { delay: 4160, text: "    triple-click footer   replay this intro", tone: "hint" },
  { delay: 4360, text: "" },

  { delay: 4460, text: "  built by Vishal Gupta · PRs welcome", tone: "dim" },
  { delay: 4660, text: "" },
  { delay: 4760, text: "  ───────────────────────────────────", tone: "dim" },
  { delay: 4880, text: "   press any key to close", tone: "dim" },
  { delay: 5040, text: "" },
  { delay: 5160, text: "$ _", tone: "prompt" },
];

/** Is the demo currently visible? Prevents double-mount from rapid triggers. */
let _running = false;

/**
 * Play the cinematic once. Creates a fresh fixed-position overlay on
 * top of the webview body, streams the content, then stays put until
 * the user dismisses.
 */
export function runDemo(): void {
  if (_running) return;
  _running = true;

  const overlay = document.createElement("div");
  overlay.id = "cm-demo-overlay";
  overlay.style.cssText = [
    "position: fixed",
    "inset: 0",
    "background: radial-gradient(circle at 12% -10%, rgba(217,119,87,0.18), transparent 45%), #0b0b0d",
    "color: #ffffff",
    "font-family: 'Cascadia Code', 'Fira Code', 'SF Mono', 'Menlo', monospace",
    // Bumped to 12.5px so boot-line text is comfortably readable on
    // a 450px sidebar. 11px was too tight; lines washed out against
    // the dark background.
    "font-size: 12.5px",
    "line-height: 1.6",
    "padding: 22px 18px",
    "overflow: auto",
    // pre-wrap so long text lines fall to the next row instead of
    // overflowing horizontally on narrow sidebars. Logo overrides
    // back to `pre` because ASCII art must NOT wrap mid-row.
    "white-space: pre-wrap",
    "user-select: none",
    "cursor: default",
    "z-index: 99999",
    "opacity: 0",
    "transition: opacity 400ms ease",
  ].join(";");

  const content = document.createElement("div");
  // No max-width — let content fill the sidebar minus padding. Narrow
  // sidebars (300-350px) would clip a fixed-width column on the right.
  content.style.cssText = "position:relative;z-index:2";
  overlay.appendChild(content);

  // Very subtle scanlines — just enough for CRT mood, not enough to
  // stripe the text. Previous 30% black every 2 rows was washing out
  // the boot lines. 8% every 3 rows is the sweet spot.
  const scanline = document.createElement("div");
  scanline.style.cssText = [
    "position: absolute",
    "inset: 0",
    "pointer-events: none",
    "background: repeating-linear-gradient(transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 4px)",
    "z-index: 3",
  ].join(";");
  overlay.appendChild(scanline);

  // Soft vignette so the edges darken slightly.
  const vignette = document.createElement("div");
  vignette.style.cssText = [
    "position: absolute",
    "inset: 0",
    "pointer-events: none",
    "background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.5) 100%)",
    "z-index: 4",
  ].join(";");
  overlay.appendChild(vignette);

  // One-time blink keyframe for the trailing prompt cursor + a
  // gentle pulse on the wordmark.
  if (!document.getElementById("cm-demo-keys")) {
    const style = document.createElement("style");
    style.id = "cm-demo-keys";
    style.textContent = `
      @keyframes cmDemoBlink { 0%,100%{opacity:1} 50%{opacity:0} }
      @keyframes cmDemoPulse { 0%,100%{text-shadow:0 0 12px rgba(217,119,87,0.45)} 50%{text-shadow:0 0 28px rgba(217,119,87,0.9)} }
      @keyframes cmDemoFadeIn { from{opacity:0;transform:translateX(-6px)} to{opacity:1;transform:translateX(0)} }
      @keyframes cmDemoFadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
      .cm-demo-line { animation: cmDemoFadeUp 260ms ease-out both; }
      .cm-demo-cursor::after {
        content: "▌";
        display: inline-block;
        margin-left: 2px;
        color: #ff8966;
        animation: cmDemoBlink 0.85s step-end infinite;
      }
      .cm-demo-ok {
        color: #a8e67c;
        font-weight: bold;
        margin-left: 6px;
        opacity: 0;
        animation: cmDemoFadeIn 180ms ease-out forwards;
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => {
    overlay.style.opacity = "1";
  });

  const timers: ReturnType<typeof setTimeout>[] = [];

  // Logo — Claude terracotta with a soft glow. Narrower font-size so
  // it fits cleanly within a 400-450px sidebar.
  const logoEl = document.createElement("div");
  logoEl.style.cssText = [
    "color: #d97757",
    "opacity: 0",
    "transition: opacity 500ms ease",
    // Tight font so the 64-char MANAGER row still clears ~350px
    // sidebars. Line-height tight for the block feel.
    "font-size: 7px",
    "line-height: 1.05",
    "margin-bottom: 14px",
    "text-shadow: 0 0 10px rgba(217,119,87,0.45)",
    "animation: cmDemoPulse 3.5s ease-in-out infinite",
    // Logo is ASCII art — must NOT wrap. Overrides the overlay's
    // pre-wrap default.
    "white-space: pre",
    "overflow: hidden",
  ].join(";");
  logoEl.textContent = LOGO_LINES.join("\n");
  content.appendChild(logoEl);
  timers.push(setTimeout(() => { logoEl.style.opacity = "1"; }, 80));

  // Color lookup per tone. Extracted so both the typewriter path and
  // the fade-up path share the same palette without duplicating
  // cssText strings inline.
  const tonePalette: Record<string, string> = {
    ok:     "color:#d0ccbe",
    dim:    "color:#9a8f87",
    brand:  "color:#ff8966;font-weight:bold;font-size:14px;letter-spacing:2px;text-shadow:0 0 14px rgba(255,137,102,0.65)",
    accent: "color:#ffd275;font-weight:bold",
    head:   "color:#ffa87a;font-weight:bold;margin-top:6px;letter-spacing:0.8px;font-size:13px",
    hint:   "color:#e8dfd5",
    cmd:    "color:#ff8966;font-weight:bold",
    prompt: "color:#ff8966;font-weight:bold;animation:cmDemoBlink 1s step-end infinite",
    default: "color:#ffffff",
  };

  const lineBase = 700;
  for (const { delay, text, tone } of BOOT_LINES) {
    const t = setTimeout(() => {
      const line = document.createElement("div");
      line.style.cssText = tonePalette[tone ?? "default"] ?? tonePalette.default;
      content.appendChild(line);
      overlay.scrollTop = overlay.scrollHeight;

      // Boot steps (cmd + ok tones) get a terminal-feel typewriter
      // reveal with a trailing blinking cursor that disappears when
      // the line finishes — mimics shell output arriving. Other
      // tones use the standard fade-up so the intro doesn't feel
      // like one big typewriter (which would get exhausting).
      const isTypewriter = tone === "cmd" || tone === "ok";
      if (isTypewriter) {
        line.classList.add("cm-demo-cursor");
        let i = 0;
        const total = text.length;
        if (total === 0) {
          line.classList.remove("cm-demo-cursor");
          return;
        }
        const typeSpeed = tone === "cmd" ? 32 : 14;
        const typer = setInterval(() => {
          i++;
          line.textContent = text.slice(0, i);
          if (i >= total) {
            clearInterval(typer);
            line.classList.remove("cm-demo-cursor");
            // Append a green [ok] tag for completed boot steps so
            // the cascade reads as real output, not a credit roll.
            if (tone === "ok") {
              const ok = document.createElement("span");
              ok.className = "cm-demo-ok";
              ok.textContent = "[ok]";
              line.appendChild(ok);
            }
          }
        }, typeSpeed);
        timers.push(typer as unknown as ReturnType<typeof setTimeout>);
      } else {
        line.textContent = text;
        line.classList.add("cm-demo-line");
      }
    }, lineBase + delay);
    timers.push(t);
  }


  // Dismiss handler — keyboard only. Mouse clicks let users interact
  // with the sidebar under the scrim without killing the intro
  // accidentally; press any key when they're done reading. No
  // auto-timeout: content is long enough that auto-fading felt
  // rushed on a first read.
  let dismissed = false;
  const dismiss = (): void => {
    if (dismissed) return;
    dismissed = true;
    for (const t of timers) clearTimeout(t);
    overlay.style.opacity = "0";
    document.removeEventListener("keydown", dismiss, true);
    setTimeout(() => {
      overlay.remove();
      _running = false;
    }, 450);
  };

  // Captured at document level so nothing inside the webview can
  // swallow the keypress before we see it.
  document.addEventListener("keydown", dismiss, true);
}

/**
 * Wire triple-click on the footer brand text (`.footer-name`) to
 * replay the demo. Also auto-plays once on first-ever webview mount
 * for each machine, gated by a persisted `demoSeen` flag.
 */
export function bindDemoTrigger(): void {
  // First-run auto-play: show the cinematic exactly once per webview
  // state bucket. Stored via VS Code's setState — survives reloads,
  // scoped per-webview (so re-installs reset it naturally).
  if (!getPersisted<boolean>(DEMO_SEEN_KEY)) {
    setTimeout(() => {
      runDemo();
      setPersisted(DEMO_SEEN_KEY, true);
    }, 900);
  }

  // Triple-click replay trigger — footer brand text is always
  // rendered regardless of active tab.
  let clicks = 0;
  let resetTimer: ReturnType<typeof setTimeout> | null = null;
  document.addEventListener("click", (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (!target.closest(".footer-name")) return;
    clicks++;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { clicks = 0; }, 600);
    if (clicks >= 3) {
      clicks = 0;
      runDemo();
    }
  });
}
