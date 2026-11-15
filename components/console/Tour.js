"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

// First-visit induction. Eight short steps that light up the real interface (and switch the views so each one is seen
// working). Shown once per browser (localStorage); reopened with the GUIDE button or the ? key.
export const TOUR_KEY = "toolcoup-tour-v1";

const STEPS = [
  { title: "WELCOME", body: [
    "This console estimates, for every country, the probability of at least one coup attempt (successful or failed) in the next 6 months.",
    "Absolute numbers are small: a typical country sits near 1%. Read them against that base rate, and against each other. A new edition is filed in public every month and later scored against what actually happens.",
  ], hint: "Eight steps, about a minute. Use ← → or the buttons; Esc leaves." },
  { target: ".cx-list", side: "right", title: "THE WATCHLIST", body: [
    "Every country, ranked by probability. Click one, or step through with ↑ ↓ (or J K). Press / to filter by name or region.",
    "The triangle shows the 3-month change: amber up, cyan down.",
  ] },
  { target: ".cx-stage-wrap", side: "inside", view: "field", title: "1 · SIGNAL FIELD — WHERE", body: [
    "The world as a field of dots. Colour, plume height and pulse rate all encode the same number: the country's probability. Dark and still means low.",
    "Drag to rotate, scroll or pinch to zoom, G flips globe and plane. Click any country to read it.",
  ] },
  { target: ".cx-stage-wrap", side: "inside", view: "atlas", title: "2 · TEMPORAL ATLAS — WHEN", body: [
    "One ridge per country, 1975 to today: what the model would have said, quarter by quarter. Taller means riskier.",
    "The selected country is lit and its trajectory is marked: peak, now, and the coups that were recorded.",
  ] },
  { target: ".cx-stage-wrap", side: "inside", view: "trace", title: "3 · MODEL TRACE — WHY", body: [
    "A ledger from a reference country to this country's forecast. Each row is one family of variables: amber bars raise the odds, cyan bars lower them. The strip on the right shows where every other country stands on the same group.",
    "Click a row to filter the drivers on the right. These are associations in the data, not causes.",
  ] },
  { target: ".cx-read", side: "left", title: "THE READOUT", body: [
    "The probability with its 80% interval, rank, multiple of the base rate, the largest drivers and the recorded coup history.",
    "COUNTRY BRIEF · PDF compiles a three-page policy note that sets the model against recent press. The country page adds key figures, the full assessment and a source link for every coup on record.",
  ] },
  { target: ".cx-strip", side: "top", title: "THE TIMELINE", body: [
    "The country's forecast through time, recorded coups as red markers, and monthly ACLED activity underneath. Hover to read any month, and read the spikes with the markers in mind: activity alone does not predict a coup.",
  ] },
  { target: ".site-header", side: "bottom", title: "THE REST OF THE SITE", body: [
    "REGISTRY: every monthly forecast, archived with its date and scored once the outcome is known. It is the only honest test of a tool like this.",
    "ARCHIVE: every country's coup record with its sources. METHOD: how it is built and where it fails. Press ? at any time to reopen this guide.",
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
        <header><span>GUIDE · {String(i + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span><button onClick={finish} aria-label="Close guide">SKIP ✕</button></header>
        <h2 id="tour-title">{step.title}</h2>
        {step.body.map((t) => <p key={t}>{t}</p>)}
        {step.hint && <p className="tour-hint">{step.hint}</p>}
        <footer>
          <div className="tour-dots" aria-hidden="true">{STEPS.map((_, k) => <i key={k} className={k === i ? "on" : k < i ? "done" : ""} />)}</div>
          <div>
            {i > 0 && <button onClick={() => go(-1)}>← BACK</button>}
            <button ref={nextRef} className="primary" onClick={() => (lastStep ? finish() : go(1))}>{lastStep ? "START EXPLORING" : i === 0 ? "BEGIN →" : "NEXT →"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
