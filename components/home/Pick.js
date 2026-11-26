"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

// The home page reads one country at a time: where (the globe), when (its forecast history) and why (the model's
// terms). The reader picks it once, on any of the three, and the others follow.
const Ctx = createContext(null);
const cache = new Map();

export function PickProvider({ list, first, children }) {
  const [slug, setSlug] = useState(first.slug);
  const [detail, setDetail] = useState(first.detail);
  const bySlug = useMemo(() => new Map(list.map((c) => [c.slug, c])), [list]);
  const [live, setLive] = useMotion();                       // the hero's globe: its picture and its pause button are apart
  const pick = useCallback((s) => { if (bySlug.has(s)) setSlug(s); }, [bySlug]);
  useEffect(() => {
    if (first.detail) cache.set(first.slug, first.detail);
  }, [first]);
  useEffect(() => {
    if (cache.has(slug)) { setDetail(cache.get(slug)); return; }
    let on = true;
    fetch(`/api/countries/${slug}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) { cache.set(slug, d); if (on) setDetail(d); } }).catch(() => {});
    return () => { on = false; };
  }, [slug]);
  const value = useMemo(() => ({ list, selected: bySlug.get(slug), detail: detail?.slug === slug ? detail : null, pick, live, setLive }), [list, bySlug, slug, detail, pick, live, setLive]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const usePick = () => useContext(Ctx);

/** Whether the page may animate on its own: not on a phone, not when the reader asked for less motion. */
export function useMotion() {
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(!(window.matchMedia("(prefers-reduced-motion: reduce)").matches || window.matchMedia("(max-width: 639px)").matches));
  }, []);
  return [live, setLive];
}

export function useMedia(query) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const m = window.matchMedia(query), read = () => setOn(m.matches);
    read(); m.addEventListener("change", read);
    return () => m.removeEventListener("change", read);
  }, [query]);
  return on;
}

export function PauseButton({ live, onToggle, what }) {
  return (
    <button type="button" className={`loop-pause${live ? "" : " is-paused"}`} aria-label={live ? `Pause ${what}` : `Play ${what}`} onClick={onToggle}>
      <svg viewBox="0 0 16 16" aria-hidden="true">
        {live ? <><rect x="4.25" y="3.25" width="2.75" height="9.5" rx="0.9" /><rect x="9" y="3.25" width="2.75" height="9.5" rx="0.9" /></>
          : <path d="M5.25 3.7v8.6c0 .62.68 1 1.2.66l6.5-4.3c.47-.31.47-1 0-1.32l-6.5-4.3c-.52-.34-1.2.04-1.2.66Z" />}
      </svg>
    </button>
  );
}

/** A short row of countries to read next: the top of the list, plus the one picked if it is not among them. */
export function PickChips({ count = 5, label = "Highest chance" }) {
  const { list, selected, pick } = usePick();
  const top = list.slice(0, count);
  const rows = selected && !top.some((c) => c.slug === selected.slug) ? [...top.slice(0, count - 1), selected] : top;
  return (
    <div className="chips" role="group" aria-label={label}>
      {rows.map((c) => (
        <button key={c.slug} type="button" className="chip" aria-pressed={c.slug === selected?.slug} onClick={() => pick(c.slug)}>{c.name}</button>
      ))}
    </div>
  );
}
