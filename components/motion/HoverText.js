"use client";

import { useEffect } from "react";

// Line hover for text, after Codrops' LineTextHoverAnimations: on hover, the letters of a label flicker through random symbols from left to
// right and settle back on the real ones. One delegated listener serves every element marked data-scramble; the label lives in a child .sx.
// The real text is never edited: the flicker is drawn on an aria-hidden copy laid over it (pointer-events: none), so the link keeps its
// text node, its size and its hit area, and a click during the effect lands like any other. Mouse and keyboard focus only; reduced motion
// leaves the text alone.
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+=<>";
const STEP = 38, FLICKER = 190, STAGGER = 42;

export default function HoverText() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const running = new WeakMap();
    const rand = (c) => { const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; return c === c.toUpperCase() && c !== c.toLowerCase() ? g.toUpperCase() : g; };

    function start(el) {
      const t = el.querySelector(":scope > .sx"); if (!t || !t.firstChild) return;
      running.get(t)?.();                                              // restart cleanly if it is already running
      const text = t.textContent, chars = [...text];
      const fx = document.createElement("span");
      fx.className = "sx-fx"; fx.setAttribute("aria-hidden", "true"); fx.textContent = text; fx.style.color = getComputedStyle(t).color;
      t.classList.add("sx-run"); t.append(fx);
      const t0 = performance.now(); let timer;
      const stop = () => { clearInterval(timer); fx.remove(); t.classList.remove("sx-run"); running.delete(t); };
      running.set(t, stop);
      timer = setInterval(() => {
        const dt = performance.now() - t0;
        if (dt > chars.length * STAGGER + FLICKER) { stop(); return; }
        fx.textContent = chars.map((c, i) => (c === " " || dt < i * STAGGER || dt > i * STAGGER + FLICKER ? c : rand(c))).join("");
      }, STEP);
    }
    const over = (e) => {
      if (e.pointerType && e.pointerType !== "mouse") return;
      const el = e.target.closest?.("[data-scramble]");
      if (!el || (e.relatedTarget && el.contains(e.relatedTarget))) return;
      start(el);
    };
    const focus = (e) => { const el = e.target.closest?.("[data-scramble]"); if (el && e.target.matches?.(":focus-visible")) start(el); };
    document.addEventListener("pointerover", over); document.addEventListener("focusin", focus);
    return () => { document.removeEventListener("pointerover", over); document.removeEventListener("focusin", focus); };
  }, []);
  return null;
}
