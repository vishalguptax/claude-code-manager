// Claude Code Manager site: theme toggle, copy button, the hero "indexing"
// moment and the quota bars. No dependencies. Every element ships in its
// final state in the HTML, so with JavaScript off (or reduced motion on) the
// page is complete; this file only adds motion and small conveniences.
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const ease = "cubic-bezier(.2,.7,.2,1)";

  /* ---------- theme ---------- */
  // localStorage is a per-viewer convenience; it may throw (privacy mode).
  const toggle = document.querySelector(".theme-toggle");
  if (toggle) {
    const current = () =>
      root.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const label = () => {
      toggle.setAttribute("aria-label", current() === "dark" ? "Switch to light theme" : "Switch to dark theme");
    };
    toggle.hidden = false;
    label();
    toggle.addEventListener("click", () => {
      const next = current() === "dark" ? "light" : "dark";
      root.dataset.theme = next;
      try {
        localStorage.setItem("ccm-theme", next);
      } catch (_) {
        /* storage unavailable: the choice lasts for this page view */
      }
      label();
    });
  }

  /* ---------- copy install command ---------- */
  for (const btn of document.querySelectorAll(".copy[data-copy]")) {
    if (!navigator.clipboard) continue;
    btn.hidden = false;
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
      } catch (_) {
        btn.textContent = "Select it";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1800);
    });
  }

  if (reduce || !Element.prototype.animate) return;

  /* ---------- hero: indexing ~/.claude ---------- */
  // 0–0.7s the listing lines appear; 0.7–1.7s each line's tab lights up;
  // a scan line sweeps the screenshot. Transform and opacity only; the
  // screenshot itself is never hidden (it is the LCP image).
  const indexer = document.querySelector("[data-indexer]");
  if (indexer) {
    const lines = [...indexer.querySelectorAll(".ls-lines li")];
    const frame = indexer.querySelector(".shot-frame");
    const replay = indexer.querySelector(".replay");
    const run = () => {
      lines.forEach((li, i) => {
        li.animate(
          [{ opacity: 0, transform: "translateX(-10px)" }, { opacity: 1, transform: "none" }],
          { duration: 320, delay: i * 45, easing: ease, fill: "backwards" },
        );
        const tab = li.querySelector(".to");
        tab?.animate(
          [{ opacity: 0.15, transform: "scale(.86)" }, { opacity: 1, transform: "none" }],
          { duration: 260, delay: 700 + i * 70, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "backwards" },
        );
      });
      frame?.classList.remove("is-scanning");
      void frame?.offsetWidth; // restart the CSS sweep
      frame?.classList.add("is-scanning");
    };
    replay.hidden = false;
    replay.addEventListener("click", run);
    // After fonts settle, so the first frame is measured in the real face.
    (document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(run, 150));
  }

  /* ---------- quota bars fill once when seen ---------- */
  const bars = document.querySelectorAll("[data-quota] .q-bar i");
  if (bars.length && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const q = getComputedStyle(e.target).getPropertyValue("--q").trim() || "1";
        e.target.animate([{ transform: "scaleX(0)" }, { transform: `scaleX(${q})` }], {
          duration: 900,
          easing: ease,
        });
      }
    }, { threshold: 0.6 });
    bars.forEach((b) => io.observe(b));
  }
})();
