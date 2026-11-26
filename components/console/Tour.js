"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";

// First-visit induction. Five short steps that light up the real interface (and switch the views so each one is seen
// working). Shown once per browser (localStorage); reopened with the GUIDE button or the ? key.
export const TOUR_KEY = "toolcoup-tour-v1";

const STEPS = [
  { title: "Welcome to Praevex", logo: true, body: [
    "Praevex gives each country a chance, in percent, of at least one coup attempt in the next six months. Successful and failed attempts both count.",
    "A typical country sits near 1%, so judge a figure against that and against its neighbours. We file a new issue every month and score it later against what happened.",
  ], hint: "Five short steps. Arrow keys move, Esc closes." },
  { target: ".cx-list", side: "right", title: "Pick a country", body: [
    "The watchlist opens from the highest chance to the lowest; you can also sort it by rise or by name. Click a country, use the arrow keys, or press / to filter.",
    "The small figure is the move over three months, in points: amber up, cyan down.",
  ] },
  { target: ".cx-tabs", side: "bottom", view: "field", title: "Three ways to read one forecast", body: [
    "Where: a globe coloured by each country's chance. When: one ridge per country since 1975. Why: how each group of variables pushes this country's odds up or down.",
    "Switch with the tabs or the keys 1, 2 and 3. Drag and scroll move the globe; G turns it into a flat map; T hides the timeline.",
  ] },
  { target: ".cx-read", side: "left", title: "The readout", body: [
    "The chance with its 80% range, the rank, the biggest drivers and the coup record.",
    "Download country brief builds a four-page note, cover included, that sets our model against recent press. The country page has every figure and a source for each coup.",
  ] },
  { target: ".nav", side: "bottom", title: "The rest of the site", body: [
    "The header opens the map of every recorded coup since 1900, the violence, unrest and market outlooks, the registry of filed forecasts and the method. Search any country with ⌘K.",
    "Press ? to open this guide again.",
  ], last: true },
];

const W = 360, GAP = 14, PAD = 5;

export default function Tour({ open, onClose, onView }) {
  const [i, setI] = useState(0);
  const [box, setBox] = useState(null);
  const [narrow, setNarrow] = useState(false);
  const cardRef = useRef(null), nextRef = useRef(null);
  const step = STEPS[i];

  const measure = useCallback(() => {
    setNarrow(window.innerWidth <= 860);
    if (!step.target) { setBox(null); return; }
    const el = document.querySelector(step.target);
    if (!el) { setBox(null); return; }
    const r = el.getBoundingClientRect();
    if (window.innerWidth <= 860 && (r.top < 0 || r.bottom > window.innerHeight)) el.scrollIntoView({ block: "center", behavior: "instant" });
    const q = el.getBoundingClientRect();
    setBox({ x: q.left, y: q.top, w: q.width, h: q.height });
  }, [step]);

  useEffect(() => { if (open) setI(0); }, [open]);
  useEffect(() => { if (open && step.view) onView?.(step.view); }, [open, step, onView]);
  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const t = setTimeout(measure, 380);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [open, measure]);
  useEffect(() => { if (open) nextRef.current?.focus(); }, [open, i]);

  const finish = useCallback(() => { try { localStorage.setItem(TOUR_KEY, "1"); } catch {} onClose(); }, [onClose]);
  const go = useCallback((k) => setI((v) => Math.max(0, Math.min(STEPS.length - 1, v + k))), []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); i === STEPS.length - 1 ? finish() : go(1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); go(-1); }
      else if (e.key === "Tab") {                       // keep focus inside the dialog
        const f = cardRef.current?.querySelectorAll("button"); if (!f?.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener("keydown", onKey, true); return () => window.removeEventListener("keydown", onKey, true);
  }, [open, i, go, finish]);

  if (!open) return null;
  // card position
  let pos = { left: "50%", top: "50%", transform: "translate(-50%,-50%)" };
  if (narrow) pos = { left: 8, right: 8, bottom: 8, top: "auto", transform: "none", width: "auto" };
  else if (box) {
    const vw = window.innerWidth, vh = window.innerHeight, h = 300;
    let x, y;
    if (step.side === "right") { x = box.x + box.w + GAP; y = box.y + 60; }
    else if (step.side === "left") { x = box.x - W - GAP; y = box.y + 60; }
    else if (step.side === "top") { x = box.x + box.w / 2 - W / 2; y = box.y - h - GAP; }
    else if (step.side === "bottom") { x = box.x + 24; y = box.y + box.h + GAP; }
    else { x = box.x + 18; y = box.y + box.h - h - 18; }
    pos = { left: Math.max(10, Math.min(vw - W - 10, x)), top: Math.max(10, Math.min(vh - h - 10, y)), transform: "none" };
  }
  const lastStep = i === STEPS.length - 1;
  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {box && !narrow && <div className="tour-spot" style={{ left: box.x - PAD, top: box.y - PAD, width: box.w + PAD * 2, height: box.h + PAD * 2 }} />}
      {(!box || narrow) && <div className="tour-dim" />}
      <div className="tour-card" ref={cardRef} style={{ ...pos, width: narrow ? undefined : W }}>
        <header><span>Step {i + 1} of {STEPS.length}</span><button onClick={finish} aria-label="Close the guide">Skip guide</button></header>
        {step.logo && <Brand variant="lockup" height={72} className="tour-logo" />}
        <h2 id="tour-title">{step.title}</h2>
        {step.body.map((t) => <p key={t}>{t}</p>)}
        {step.hint && <p className="tour-hint">{step.hint}</p>}
        <footer>
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
          <div>
            {i > 0 && <button className="btn btn--secondary" onClick={() => go(-1)}>Back</button>}
            <button ref={nextRef} className="btn btn--primary" onClick={() => (lastStep ? finish() : go(1))}>{lastStep ? "Close the guide" : i === 0 ? "Start the guide" : "Next step"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
