"use client";

import { useEffect } from "react";

// Line hover for text, after Codrops' LineTextHoverAnimations: on hover, the letters of a label flicker through
// random symbols from left to right and settle back on the real ones. One delegated listener serves every element
// marked data-scramble; the text lives in a child .sx (or the element's single text node). The width is held while it
// runs so nothing around it moves. Mouse and keyboard focus only; reduced motion leaves the text alone.
const GLYPHS = "abcdefghijklmnopqrstuvwxyz0123456789!@#$%&*+=<>";
const STEP = 38, FLICKER = 190, STAGGER = 42;

export default function HoverText() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const running = new WeakMap();
    const rand = (c) => { const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)]; return c === c.toUpperCase() && c !== c.toLowerCase() ? g.toUpperCase() : g; };
    const target = (el) => el.querySelector(":scope > .sx") || (el.childNodes.length === 1 && el.firstChild.nodeType === 3 ? el : null);

    function start(el) {
      const t = target(el); if (!t) return;
      running.get(t)?.();                                              // restart cleanly if it is already running
      const text = t.dataset.sxText || (t.dataset.sxText = t.textContent), chars = [...text];
      const box = t.getBoundingClientRect(), saved = { d: t.style.display, w: t.style.width, ws: t.style.whiteSpace };
      t.style.display = "inline-block"; t.style.width = `${Math.ceil(box.width)}px`; t.style.whiteSpace = "nowrap";
      const t0 = performance.now(); let timer;
      const stop = () => { clearInterval(timer); t.textContent = text; t.style.display = saved.d; t.style.width = saved.w; t.style.whiteSpace = saved.ws; running.delete(t); };
      running.set(t, stop);
      timer = setInterval(() => {
        const dt = performance.now() - t0;
        if (dt > chars.length * STAGGER + FLICKER) { stop(); return; }
        t.textContent = chars.map((c, i) => (c === " " || dt < i * STAGGER || dt > i * STAGGER + FLICKER ? c : rand(c))).join("");
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
