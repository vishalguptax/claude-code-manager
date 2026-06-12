// Claude Manager landing — scramble headline, counters, copy button, scroll
// reveal. No dependencies.
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- scramble-resolve headline (reference signature) ---------- */
  // Letters churn through glyphs then lock in left-to-right.
  function scramble(el) {
    var finalText = el.textContent;
    var glyphs = "abcdefghijklmnopqrstuvwxyz·—/";
    var frame = 0;
    var locked = 0;
    var total = finalText.length;
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
      else el.textContent = finalText;
    }
    requestAnimationFrame(tick);
  }

  if (!reduce) {
    Array.prototype.slice.call(document.querySelectorAll("[data-scramble]")).forEach(function (el) {
      setTimeout(function () { scramble(el); }, 350);
    });
  }

  /* ---------- animated counters ---------- */
  function formatInt(n) { return n.toLocaleString("en-US"); }

  function animateCount(el) {
    var target = parseInt(el.getAttribute("data-target"), 10) || 0;
    var final = el.getAttribute("data-final") || formatInt(target);
    if (reduce) { el.textContent = final; return; }
    var dur = 1400, start = null;
    function step(ts) {
      if (start === null) start = ts;
      var t = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - t, 3);
      el.textContent = formatInt(Math.round(target * eased));
      if (t < 1) requestAnimationFrame(step);
      else el.textContent = final;
    }
    requestAnimationFrame(step);
  }

  var animated = Array.prototype.slice.call(document.querySelectorAll("[data-animate]"));
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
