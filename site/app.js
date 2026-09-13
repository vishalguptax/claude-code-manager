// Claude Manager landing — scramble headline, counters, copy button, scroll
// reveal. No dependencies.
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- layout-shift guard ---------- */
  // Both animations below rewrite textContent frame by frame. The markup ships
  // the FINAL text, so at startup every element is already the size it will end
  // at — lock that size in before the first frame and the churn can no longer
  // reflow anything around it.
  //
  // Without this the hero heaved: random scramble glyphs are not the width of
  // "Mission control", so the h1 flipped between a two- and three-line layout
  // (63px) and shoved the lede, buttons, install command and proof line 54px up
  // and down for the length of the animation. The counter did the same
  // horizontally, sliding the stars and rating 41px right as "0" grew into
  // "28,855".
  //
  // Measured after fonts settle: taking a width against fallback metrics would
  // lock in the wrong number and leave the real shift in place.
  function lockWidth(el) {
    el.style.minWidth = el.getBoundingClientRect().width + "px";
    return function release() { el.style.minWidth = ""; };
  }

  // Preloaded + font-display:swap means this is usually already settled; the
  // guard is for a cold cache, where the swap itself would otherwise reflow.
  var fontsReady =
    document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

  /* ---------- scramble-resolve headline (reference signature) ---------- */
  // Letters churn through glyphs then lock in left-to-right.
  function scramble(el) {
    var finalText = el.textContent;
    var glyphs = "abcdefghijklmnopqrstuvwxyz·—/";
    var frame = 0;
    var locked = 0;
    var total = finalText.length;
    var release = lockWidth(el);
    function tick() {
      frame++;
      if (frame % 2 === 0 && locked < total) locked++;
      var out = "";
      for (var i = 0; i < total; i++) {
        var ch = finalText[i];
        if (i < locked || ch === " " || ch === ".") out += ch;
        else out += glyphs[(Math.random() * glyphs.length) | 0];
      }
      el.textContent = out;
      if (locked < total) requestAnimationFrame(tick);
      else { el.textContent = finalText; release(); }
    }
    requestAnimationFrame(tick);
  }

  if (!reduce) {
    fontsReady.then(function () {
      Array.prototype.slice.call(document.querySelectorAll("[data-scramble]")).forEach(function (el) {
        setTimeout(function () { scramble(el); }, 350);
      });
    });
  }

  /* ---------- animated counters ---------- */
  function formatInt(n) { return n.toLocaleString("en-US"); }

  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-target"), 10) || 0;
    var final = el.getAttribute("data-final") || formatInt(target);
    if (reduce) { el.textContent = final; return; }
    var release = lockWidth(el);
    var dur = 1400, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatInt(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
      else { el.textContent = final; release(); }
    }
    requestAnimationFrame(step);
  }

  var animated = Array.prototype.slice.call(document.querySelectorAll("[data-animate]"));
  // Counters sit above the fold, so the observer fires at once on load; the
  // width lock inside animateCount is what keeps that from moving the line.
  if ("IntersectionObserver" in window && animated.length) {
    var once = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { animateCount(e.target); obs.unobserve(e.target); }
      });
    }, { threshold: 0.6 });
    animated.forEach(function (el) { once.observe(el); });
  } else {
    animated.forEach(function (el) { el.textContent = el.getAttribute("data-final") || el.textContent; });
  }

  /* ---------- copy install command ---------- */
  Array.prototype.slice.call(document.querySelectorAll(".copy-btn")).forEach(function (btn) {
    btn.addEventListener("click", function () {
      var text = btn.getAttribute("data-copy") || "";
      var label = btn.querySelector(".copy-label");
      function done() {
        btn.classList.add("copied");
        if (label) label.textContent = "Copied";
        setTimeout(function () { btn.classList.remove("copied"); if (label) label.textContent = "Copy"; }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, done);
      } else {
        var ta = document.createElement("textarea");
        ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch (e) {}
        document.body.removeChild(ta); done();
      }
    });
  });

  /* ---------- scroll reveal (default visible; hidden only when JS can reveal) ---------- */
  if (!reduce && "IntersectionObserver" in window) {
    var targets = Array.prototype.slice.call(
      document.querySelectorAll(".feat, .fact, .cmp, .faq details, .sheet-cta h2, .sheet-cta > p, .sheet-cta .cta-row")
    );
    targets.forEach(function (el, i) {
      el.classList.add("js-reveal");
      el.style.transitionDelay = (i % 4) * 60 + "ms";
    });
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add("in"); obs.unobserve(e.target); }
      });
    }, { threshold: 0.1, rootMargin: "0px 0px -6% 0px" });
    targets.forEach(function (el) { revealer.observe(el); });
  }
})();
