"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stage from "@/components/lab/Stage";
import { CH } from "@/components/lab/geometry";
import { labelEn } from "@/lib/english";
import { pct, TYPE_LABEL } from "@/lib/format";

const VIEWS = [
  { key: "field", n: "01", name: "SIGNAL FIELD" },
  { key: "atlas", n: "02", name: "TEMPORAL ATLAS" },
  { key: "trace", n: "03", name: "MODEL TRACE" },
];
const fmtMonth = (s) => (s ? new Date(s + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
function makeRows(data, span) {
  const s = data?.series; if (!s?.unrest?.length) return [];
  const [year, month] = s.start.split("-").map(Number), offset = Math.max(0, s.unrest.length - span);
  return s.unrest.slice(offset).map((_, i) => ({
    date: new Date(Date.UTC(year, month - 1 + offset + i, 1)).toISOString().slice(0, 7),
    ...Object.fromEntries(CH.map((c) => [c.key, s[c.key]?.[offset + i] ?? 0])),
  }));
}

export default function Instrument({ countries, meta, model }) {
  const ranked = useMemo(() => countries.filter((c) => !c.historical && c.risk != null).sort((a, b) => a.rank - b.rank), [countries]);
  const bySlug = useMemo(() => new Map(ranked.map((c) => [c.slug, c])), [ranked]);
  const [slug, setSlug] = useState(ranked[0]?.slug);
  const [view, setView] = useState("field");
  const [span, setSpan] = useState(180), [layers, setLayers] = useState(CH.map((c) => c.key));
  const [ambient, setAmbient] = useState(true), [reduced, setReduced] = useState(false);
  const [playing, setPlaying] = useState(false), [speed, setSpeed] = useState(600), [cursor, setCursor] = useState(null);
  const [q, setQ] = useState(""), [result, setResult] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [log, setLog] = useState([]), logId = useRef(0), listRef = useRef(null);
  const country = bySlug.get(slug) || ranked[0];

  const note = useCallback((tag, text) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLog((old) => [{ id: ++logId.current, time, tag, text }, ...old].slice(0, 9));
  }, []);

  // shareable state: ?c=niger&v=atlas
  const booted = useRef(false);
  useEffect(() => {
    if (!booted.current) {                                  // read the link once, before this component writes it
      booted.current = true;
      const p = new URLSearchParams(window.location.search);
      if (p.get("c") && bySlug.has(p.get("c"))) setSlug(p.get("c"));
      if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    }
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(mq.matches); if (mq.matches) setPlaying(false); };
    sync(); mq.addEventListener("change", sync); return () => mq.removeEventListener("change", sync);
  }, [bySlug]);
  const wrote = useRef(false);
  useEffect(() => {
    if (!wrote.current) { wrote.current = true; return; }   // first pass: the link may still be pending
    if (slug) window.history.replaceState(null, "", `?c=${slug}&v=${view}`);
  }, [slug, view]);

  useEffect(() => {
    if (!country) return;
    const ctl = new AbortController(); setError(false); setCursor(null); setPlaying(false);
    fetch(`/api/countries/${encodeURIComponent(country.slug)}`, { signal: ctl.signal })
      .then((r) => { if (!r.ok) throw Error(); return r.json(); })
      .then((data) => setResult({ slug: country.slug, data }))
      .catch((e) => { if (e.name !== "AbortError") setError(true); });
    return () => ctl.abort();
  }, [country, retry]);

  const detail = result?.slug === country?.slug ? result.data : null;
  const rows = useMemo(() => makeRows(detail, span), [detail, span]);
  const events = useMemo(() => detail?.coups?.filter((e) => !e.dup && e.prec !== "year" && "ABC".includes(e.conf) && ["riuscito", "fallito"].includes(e.type)) || [], [detail]);
  const inWindow = useMemo(() => (rows.length ? events.filter((e) => e.date.slice(0, 7) >= rows[0].date && e.date.slice(0, 7) <= rows.at(-1).date) : []), [events, rows]);
  const index = cursor == null ? rows.length - 1 : Math.max(0, Math.min(cursor, rows.length - 1));
  const current = rows[index];
  const inMonth = current ? events.filter((e) => e.date.slice(0, 7) === current.date) : [];

  useEffect(() => {
    if (!detail || !rows.length) return;
    const r = rows.at(-1);
    note("LOAD", `${country.iso || "—"} ${country.name} / ${rows.length} months to ${r.date}`);
    note("LATEST", `unrest ${r.unrest} · violence ${r.violence} · fatalities ${r.fatalities}`);
    note("FORECAST", `${(country.risk * 100).toFixed(2)}% / ${meta.horizon} mo · base ${(meta.base_rate * 100).toFixed(2)}%`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.slug, span]);

  useEffect(() => {
    if (!playing || reduced || !rows.length) return;
    const id = setInterval(() => { if (!document.hidden) setCursor((i) => (i == null || i >= rows.length - 1 ? 0 : i + 1)); }, speed);
    return () => clearInterval(id);
  }, [playing, reduced, rows.length, speed]);

  // keyboard: 1 / 2 / 3 switch the view, unless typing
  useEffect(() => {
    const key = (e) => {
      if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = VIEWS[Number(e.key) - 1]; if (v) { setView(v.key); note("VIEW", v.name.toLowerCase()); }
    };
    window.addEventListener("keydown", key); return () => window.removeEventListener("keydown", key);
  }, [note]);

  const choose = (c) => { if (c.slug !== slug) { setSlug(c.slug); } };
  const select = (i) => { setCursor(i); setPlaying(false); const r = rows[i]; if (r) note("INSPECT", `${r.date} · U ${r.unrest} · V ${r.violence} · F ${r.fatalities}`); };
  const toggleLayer = (key) => {
    if (layers.includes(key) && layers.length === 1) return;
    setLayers((old) => (old.includes(key) ? old.filter((k) => k !== key) : CH.map((c) => c.key).filter((k) => k === key || old.includes(k))));
    note("LAYER", `${key} ${layers.includes(key) ? "hidden" : "shown"}`);
  };
  const list = useMemo(() => { const n = q.trim().toLowerCase(); return ranked.filter((c) => !n || c.name.toLowerCase().includes(n) || (c.region || "").toLowerCase().includes(n)); }, [ranked, q]);
  const maxRisk = ranked[0]?.risk || 1;
  const drivers = (detail?.drivers || country?.drivers || []).slice(0, 5);
  const dmax = Math.max(1e-6, ...drivers.map((d) => Math.abs(d.contrib)));
  const guide = {
    field: `Curve = events accumulated since ${rows[0]?.date || "the start"}. Thickness = how intense each month was — inner to outer: protests, violence, fatalities. Scatter grows with the outer signal.`,
    atlas: "One turn = the whole window. Tube radius = monthly intensity. Twist = how fast things change. Height = violence vs protest. Diamonds = recorded coups.",
    trace: `Where the forecast comes from: sources → variables → groups → models. The lit path is the largest contributions for ${country?.name}.`,
  }[view];
  if (!country) return null;

  return (
    <main className="lab">
      <aside className="lab-left" aria-label="Countries and controls">
        <section className="lab-sec lab-countries">
          <header><h4>COUNTRIES</h4><span>BY P(ATTEMPT)</span></header>
          <input className="lab-input" type="search" placeholder="Filter country or region" aria-label="Filter countries" value={q} onChange={(e) => setQ(e.target.value)} />
          <ol className="lab-rank" ref={listRef}>
            {list.map((c) => (
              <li key={c.slug}>
                <button className={c.slug === slug ? "on" : ""} aria-current={c.slug === slug ? "true" : undefined} onClick={() => choose(c)}>
                  <span className="n">{c.rank}</span><span className="name">{c.name}</span>
                  <span className="bar"><i style={{ width: `${(c.risk / maxRisk) * 100}%` }} /></span><span className="v">{pct(c.risk)}</span>
                </button>
              </li>
            ))}
            {!list.length && <li className="lab-empty">No match.</li>}
          </ol>
        </section>
        <section className="lab-sec lab-controls">
          <header><h4>WINDOW</h4></header>
          <div className="lab-seg" role="group" aria-label="Window">
            {[[60, "5Y"], [120, "10Y"], [180, "15Y"]].map(([v, l]) => <button key={v} aria-pressed={span === v} onClick={() => { setSpan(v); setCursor(null); setPlaying(false); note("WINDOW", l.toLowerCase()); }}>{l}</button>)}
          </div>
          <header><h4>SIGNALS</h4></header>
          <div className="lab-toggles" role="group" aria-label="Signals">
            {CH.map((c) => <button key={c.key} aria-pressed={layers.includes(c.key)} onClick={() => toggleLayer(c.key)} style={{ "--c": c.color }}><i />{c.short}</button>)}
          </div>
          <header><h4>MOTION</h4></header>
          <div className="lab-seg" role="group" aria-label="Motion">
            <button aria-pressed={ambient && !reduced} disabled={reduced} onClick={() => { setAmbient(!ambient); note("MOTION", ambient ? "off" : "on"); }}>{reduced ? "REDUCED" : ambient ? "ON" : "OFF"}</button>
            {[[1200, "0.5×"], [600, "1×"], [300, "2×"]].map(([v, l]) => <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)} aria-label={`Playback ${l}`}>{l}</button>)}
          </div>
        </section>
        <section className="lab-sec lab-matrix">
          <header><h4>OBSERVATION MATRIX</h4><span>{rows.length} MO</span></header>
          {rows.length > 0 && <Matrix rows={rows} index={index} onSelect={select} layers={layers} />}
        </section>
      </aside>

      <section className="lab-center">
        <div className="lab-tabs">
          <div role="tablist" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} role="tab" aria-selected={view === v.key} onClick={() => { setView(v.key); note("VIEW", v.name.toLowerCase()); }}>
                <span>{v.n}</span>{v.name}
              </button>
            ))}
          </div>
          <div className="lab-title"><b key={country.slug} className="lab-swap">{country.name}</b><span>{country.region}</span></div>
        </div>
        <p className="lab-guide" key={view}>{guide}</p>
        {error ? <div className="lab-status" role="alert">Unable to load observations. <button onClick={() => setRetry((x) => x + 1)}>Retry</button></div>
          : !detail ? <div className="lab-status"><span className="lab-pulse" /> RETRIEVING {country.name.toUpperCase()}</div>
          : !rows.length ? <div className="lab-status">Monthly observations are not available for this territory.</div>
          : <Stage country={country} detail={detail} rows={rows} events={events} model={model} meta={meta} view={view} index={index}
                   onSelect={select} reduced={reduced} ambient={ambient} layers={layers} playing={playing} speed={speed} />}
      </section>

      <aside className="lab-right" aria-label="Readouts">
        <section className="lab-sec lab-forecast">
          <header><h4>FORECAST</h4><span>NEXT {meta.horizon} MONTHS</span></header>
          <b key={country.slug} className="lab-swap">{pct(country.risk)}</b>
          {country.risk_lo != null && <small>plausible {pct(country.risk_lo)} – {pct(country.risk_hi)}</small>}
          <small>#{country.rank} of {ranked.length} · {(country.risk / meta.base_rate).toFixed(1)}× base rate</small>
        </section>
        {current && <section className="lab-sec lab-month">
          <header><h4>MONTH</h4><span key={current.date} className="lab-swap">{fmtMonth(current.date)}</span></header>
          {CH.map((c) => (
            <div className={`lab-read ${layers.includes(c.key) ? "" : "off"}`} key={c.key} style={{ "--c": c.color }}>
              <span>{c.short}</span><strong key={current.date} className="lab-swap">{current[c.key].toLocaleString("en-GB")}</strong>
              <Spark values={rows.map((r) => r[c.key])} index={index} color={c.color} />
            </div>
          ))}
          <p className="lab-record">{inMonth.length ? inMonth.map((e) => <span key={e.id}>{e.type === "riuscito" ? "◆" : "◇"} {TYPE_LABEL[e.type]} coup · {e.conf}</span>) : "No coup attempt recorded this month."}</p>
        </section>}
        <section className="lab-sec lab-why">
          <header><h4>LARGEST CONTRIBUTIONS</h4><span>LOG-ODDS</span></header>
          {drivers.map((d) => (
            <div key={d.label} className="lab-driver">
              <span>{labelEn(d.label)}</span>
              <i className={d.contrib >= 0 ? "up" : "down"} style={{ width: `${(Math.abs(d.contrib) / dmax) * 100}%` }} />
              <b>{d.contrib >= 0 ? "+" : "−"}{Math.abs(d.contrib).toFixed(2)}</b>
            </div>
          ))}
          <button className="lab-link" onClick={() => { setView("trace"); note("VIEW", "model trace"); }}>SEE THE PATH IN MODEL TRACE →</button>
        </section>
        <section className="lab-sec lab-links">
          <Link href={`/paese/${country.slug}`}>COUNTRY DOSSIER ↗</Link>
          <Link href="/metodo">METHOD & VALIDATION ↗</Link>
        </section>
      </aside>

      <section className="lab-bottom">
        <div className="lab-time">
          <button className="lab-play" disabled={reduced || !rows.length} aria-pressed={playing}
                  onClick={() => { if (!playing && index >= rows.length - 1) setCursor(0); setPlaying(!playing); note("PLAYBACK", playing ? `paused at ${current?.date}` : `started · ${(600 / speed).toFixed(1)}×`); }}>
            {playing ? "Ⅱ" : "▷"}
          </button>
          <label htmlFor="lab-month"><b key={current?.date} className="lab-swap">{fmtMonth(current?.date)}</b><span>{rows[0]?.date} — {rows.at(-1)?.date}</span></label>
          <div className="lab-range">
            <input id="lab-month" type="range" min="0" max={Math.max(0, rows.length - 1)} value={index} disabled={!rows.length} onChange={(e) => select(Number(e.target.value))} />
            <div className="lab-ticks" aria-hidden="true">
              {inWindow.map((e) => { const i = rows.findIndex((r) => r.date === e.date.slice(0, 7)); return i < 0 ? null :
                <i key={e.id} className={e.type} style={{ left: `${(i / Math.max(1, rows.length - 1)) * 100}%` }} />; })}
            </div>
          </div>
          <button className="lab-latest" onClick={() => { setCursor(null); setPlaying(false); }}>LATEST</button>
        </div>
        <div className="lab-console">
          <div className="lab-log" aria-live="off">
            <h4>ANALYSIS LOG</h4>
            {log.map((l) => <p key={l.id} className="lab-swap"><span>{l.time}</span><span>{l.tag}</span><span>{l.text}</span></p>)}
          </div>
          <div className="lab-events">
            <h4>RECORDED COUPS · {inWindow.length} IN WINDOW</h4>
            {inWindow.length ? inWindow.slice(-6).reverse().map((e) => (
              <button key={e.id} onClick={() => select(rows.findIndex((r) => r.date === e.date.slice(0, 7)))}>
                <span>{e.prec === "month" ? e.date.slice(0, 7) : e.date}</span><span>{e.type === "riuscito" ? "◆" : "◇"} {TYPE_LABEL[e.type]}</span><span>{e.conf}</span>
              </button>)) : <p>None in this window.</p>}
          </div>
        </div>
      </section>
    </main>
  );
}

/** Three signals × months, each cell shaded by log intensity; click or drag to inspect a month. */
function Matrix({ rows, index, onSelect, layers }) {
  const ref = useRef(null), live = useRef(onSelect); live.current = onSelect;
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"), M = rows.length;
    const max = CH.map((ch) => Math.max(1, ...rows.map((r) => r[ch.key])));
    const draw = () => {
      const w = c.clientWidth, h = c.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const rowH = (h - 12) / 3, cw = w / M;
      CH.forEach((ch, k) => {
        const on = layers.includes(ch.key);
        rows.forEach((r, i) => { const v = Math.log1p(r[ch.key]) / Math.log1p(max[k]);
          ctx.fillStyle = ch.color; ctx.globalAlpha = on ? 0.05 + 0.95 * Math.pow(v, 0.85) : 0.04;
          ctx.fillRect(i * cw, k * rowH + 1, Math.ceil(cw), rowH - 2); });
      });
      ctx.globalAlpha = 1;
      rows.forEach((r, i) => { if (!r.date.endsWith("-01")) return; const y = Number(r.date.slice(0, 4)); if (y % (M > 120 ? 3 : 2)) return;
        ctx.fillStyle = "#57544d"; ctx.font = '6px "JetBrains Mono", monospace'; ctx.fillText(String(y), i * cw, h - 2); });
      ctx.strokeStyle = "#f6f0df"; ctx.lineWidth = 1; ctx.strokeRect(index * cw - 0.5, 0.5, Math.max(1.5, cw) + 1, 3 * rowH - 1);
    };
    draw();
    const ro = new ResizeObserver(draw); ro.observe(c);
    let down = false;
    const pick = (e) => { const b = c.getBoundingClientRect(); live.current(Math.max(0, Math.min(M - 1, Math.floor(((e.clientX - b.left) / b.width) * M)))); };
    const pd = (e) => { down = true; c.setPointerCapture(e.pointerId); pick(e); }, pm = (e) => { if (down) pick(e); }, pu = () => { down = false; };
    c.addEventListener("pointerdown", pd); c.addEventListener("pointermove", pm); c.addEventListener("pointerup", pu);
    return () => { ro.disconnect(); c.removeEventListener("pointerdown", pd); c.removeEventListener("pointermove", pm); c.removeEventListener("pointerup", pu); };
  }, [rows, index, layers]);
  return <canvas ref={ref} className="lab-matrix-canvas" aria-label="Observation matrix: use the month slider below for keyboard access" />;
}

function Spark({ values, index, color }) {
  const max = Math.max(1, ...values), r = (v) => Math.round(v * 100) / 100;
  const x = (i) => r((i / Math.max(1, values.length - 1)) * 120), y = (v) => r(20 - (Math.log1p(v) / Math.log1p(max)) * 18);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox="0 0 120 22" aria-hidden="true">
      <path d={`${d} L120,21 L0,21 Z`} fill={color} opacity=".08" /><path d={d} fill="none" stroke={color} strokeWidth=".7" />
      <line className="lab-glide" x1={x(index)} x2={x(index)} y1="0" y2="22" stroke="#f6f0df" strokeWidth=".5" />
    </svg>
  );
}
