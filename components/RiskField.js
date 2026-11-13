"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SignalField, { CHANNELS, GeoLocator } from "@/components/SignalField";
import { pct, TYPE_LABEL } from "@/lib/format";
import { labelEn } from "@/lib/english";

const fmt = (s) => (s ? new Date(s + "-01T00:00:00Z").toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" }) : "—");
function makeRows(data, span) {
  const s = data?.series; if (!s?.unrest?.length) return [];
  const [year, month] = s.start.split("-").map(Number), offset = Math.max(0, s.unrest.length - span);
  return s.unrest.slice(offset).map((_, i) => ({
    date: new Date(Date.UTC(year, month - 1 + offset + i, 1)).toISOString().slice(0, 7),
    ...Object.fromEntries(CHANNELS.map((c) => [c.key, s[c.key]?.[offset + i] ?? 0])),
  }));
}

/** Country laboratory: one dominant field, a control deck on the left, readouts on the right, a console below. */
export default function RiskField({ countries, selected, baseRate, horizon = 6 }) {
  const country = selected || countries[0];
  const [result, setResult] = useState(null), [error, setError] = useState(false), [retry, setRetry] = useState(0);
  const [cursor, setCursor] = useState(null), [playing, setPlaying] = useState(false), [reduced, setReduced] = useState(false);
  const [ambient, setAmbient] = useState(true), [view, setView] = useState("field"), [span, setSpan] = useState(180);
  const [speed, setSpeed] = useState(600), [focus, setFocus] = useState(false), [layers, setLayers] = useState(CHANNELS.map((c) => c.key));
  // Analysis log: real interaction and data events only, newest first.
  const [log, setLog] = useState([]), logId = useRef(0);
  const note = useCallback((tag, text) => {
    const time = new Date().toLocaleTimeString("en-GB", { hour12: false });
    setLog((old) => [{ id: ++logId.current, time, tag, text }, ...old].slice(0, 7));
  }, []);

  useEffect(() => {
    const ctl = new AbortController(); setError(false); setCursor(null); setPlaying(false);
    fetch(`/api/countries/${encodeURIComponent(country.slug)}`, { signal: ctl.signal })
      .then((r) => { if (!r.ok) throw Error(); return r.json(); })
      .then((data) => setResult({ slug: country.slug, data }))
      .catch((e) => { if (e.name !== "AbortError") setError(true); });
    return () => ctl.abort();
  }, [country.slug, retry]);
  useEffect(() => {
    const mq = matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => { setReduced(mq.matches); if (mq.matches) setPlaying(false); };
    sync(); mq.addEventListener("change", sync); return () => mq.removeEventListener("change", sync);
  }, []);
  useEffect(() => {
    if (!focus) return;
    const key = (e) => { if (e.key === "Escape") setFocus(false); };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [focus]);

  const data = result?.slug === country.slug ? result.data : null;
  const rows = useMemo(() => makeRows(data, span), [data, span]);
  const events = useMemo(() => data?.coups?.filter((e) => !e.dup && e.prec !== "year" && "ABC".includes(e.conf) && ["riuscito", "fallito"].includes(e.type)) || [], [data]);
  const index = cursor == null ? rows.length - 1 : Math.max(0, Math.min(cursor, rows.length - 1)), current = rows[index];
  const inMonth = events.filter((e) => current && e.date.slice(0, 7) === current.date);
  const inWindow = useMemo(() => (rows.length ? events.filter((e) => e.date.slice(0, 7) >= rows[0].date && e.date.slice(0, 7) <= rows.at(-1).date) : []), [events, rows]);

  // The month index advances in steps; the field interpolates between them, so playback reads as continuous.
  useEffect(() => {
    if (!playing || reduced || !rows.length) return;
    const id = setInterval(() => { if (!document.hidden) setCursor((i) => (i == null || i >= rows.length - 1 ? 0 : i + 1)); }, speed);
    return () => clearInterval(id);
  }, [playing, reduced, rows.length, speed]);

  const select = (i) => {
    setCursor(i); setPlaying(false);
    const r = rows[i]; if (r) note("INSPECT", `${r.date}  U ${r.unrest}  V ${r.violence}  F ${r.fatalities}`);
  };
  // one LOAD entry per country, written when its observations arrive
  useEffect(() => {
    if (!data || !rows.length) return;
    const r = rows.at(-1);
    note("LOAD", `${country.iso || "—"} ${country.name} / ${rows.length} months through ${r.date}`);
    note("LATEST", `unrest ${r.unrest}  violence ${r.violence}  fatalities ${r.fatalities}`);
    note("FORECAST", `${(country.risk * 100).toFixed(2)}% in ${horizon} mo / base ${(baseRate * 100).toFixed(2)}%`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.slug, span]);
  const toggleLayer = (key) => setLayers((old) => (old.includes(key) ? (old.length > 1 ? old.filter((k) => k !== key) : old) : CHANNELS.map((c) => c.key).filter((k) => k === key || old.includes(k))));
  function exportCSV() {
    const text = ["month,unrest_events,violence_events,reported_fatalities", ...rows.map((r) => [r.date, ...CHANNELS.map((ch) => r[ch.key])].join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" })), a = document.createElement("a");
    a.href = url; a.download = `toolcoup-${country.slug}-${rows[0].date}-${rows.at(-1).date}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const summary = CHANNELS.map((ch) => ({ ...ch, total: rows.slice(Math.max(0, index - 11), index + 1).reduce((n, r) => n + r[ch.key], 0) }));
  const drivers = data?.drivers || country.drivers || [];
  const ready = data && rows.length > 0;

  return (
    <div className={`country-instrument fx ${focus ? "instrument-focus" : ""}`} aria-busy={!data && !error}>
      <div className="country-instrument-title">
        <div className="country-heading">
          <span className="country-code">{country.iso || "—"}</span>
          <div>
            <span className="eyebrow">COUNTRY INTELLIGENCE / {country.region}</span>
            <h2 key={country.slug} className="fx-swap">{country.name}</h2>
            <p>{rows.length ? `${rows[0].date} — ${rows.at(-1).date}  /  ${rows.length} MONTHLY OBSERVATIONS` : "LOADING OBSERVATIONS"}</p>
          </div>
        </div>
        <div className="instrument-title-actions">
          <button className="text-control" aria-pressed={focus} onClick={() => setFocus(!focus)}>{focus ? "↙ EXIT FOCUS" : "↗ FOCUS"}</button>
          <Link href={`/paese/${country.slug}`}>DOSSIER ↗</Link>
        </div>
      </div>

      {error ? <div className="instrument-empty" role="alert">Unable to load observations. <button onClick={() => setRetry((x) => x + 1)}>Retry</button></div>
        : !data ? <div className="instrument-empty"><span className="loading-reticle">⌖</span> RETRIEVING MONTHLY OBSERVATIONS</div>
        : !rows.length ? <div className="instrument-empty">Monthly observations are not available for this territory.</div>
        : null}

      {ready && <>
        <div className="fx-body">
          <aside className="fx-deck" aria-label="Controls">
            <section>
              <h4>VIEW</h4>
              <div className="fx-stack" role="group" aria-label="Analytical view">
                <button aria-pressed={view === "field"} onClick={() => { setView("field"); note("VIEW", "composite field"); }}><i>▤</i> SIGNAL FIELD</button>
                <button aria-pressed={view === "radial"} onClick={() => { setView("radial"); note("VIEW", "temporal atlas"); }}><i>◉</i> TEMPORAL ATLAS</button>
              </div>
            </section>
            <section>
              <h4>LAYERS</h4>
              <div className="fx-stack" role="group" aria-label="Visible signal layers">
                {CHANNELS.map((ch) => (
                  <button key={ch.key} aria-pressed={layers.includes(ch.key)} onClick={() => { toggleLayer(ch.key); note("LAYER", `${ch.short.toLowerCase()} ${layers.includes(ch.key) ? "hidden" : "shown"}`); }} style={{ "--channel": ch.color }}>
                    <i className="fx-dot" /> {ch.short}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h4>WINDOW</h4>
              <div className="fx-seg" role="group" aria-label="Historical window">
                {[[60, "5Y"], [120, "10Y"], [180, "15Y"]].map(([v, l]) => (
                  <button key={v} aria-pressed={span === v} onClick={() => { setSpan(v); setCursor(null); setPlaying(false); }}>{l}</button>
                ))}
              </div>
            </section>
            <section>
              <h4>PLAYBACK</h4>
              <div className="fx-stack">
                <button disabled={reduced} aria-pressed={playing} onClick={() => { setPlaying(!playing); if (index === rows.length - 1) setCursor(0); note("PLAYBACK", playing ? `paused at ${current.date}` : `started / ${(600 / speed).toFixed(1)}× `); }}>
                  <i>{playing ? "Ⅱ" : "▷"}</i> {playing ? "PAUSE" : "PLAY"}
                </button>
              </div>
              <div className="fx-seg" role="group" aria-label="Playback speed">
                {[[1200, "0.5×"], [600, "1×"], [300, "2×"]].map(([v, l]) => <button key={v} aria-pressed={speed === v} onClick={() => setSpeed(v)}>{l}</button>)}
              </div>
            </section>
            <section>
              <h4>MOTION</h4>
              <div className="fx-stack">
                <button disabled={reduced} aria-pressed={ambient && !reduced} onClick={() => setAmbient(!ambient)}>
                  <i>{ambient && !reduced ? "≋" : "—"}</i> {reduced ? "REDUCED" : ambient ? "AMBIENT ON" : "AMBIENT OFF"}
                </button>
              </div>
            </section>
            <section className="fx-deck-foot">
              <h4>FORECAST / {horizon} MO</h4>
              <b>{pct(country.risk)}</b>
              <small>{baseRate > 0 ? `${(country.risk / baseRate).toFixed(2)}× BASE RATE` : "BASE RATE UNAVAILABLE"}</small>
              {country.risk_lo != null && <small>RANGE {pct(country.risk_lo)} – {pct(country.risk_hi)}</small>}
              <button className="fx-link" onClick={exportCSV}>↓ EXPORT CSV</button>
            </section>
          </aside>

          <SignalField country={country} rows={rows} events={events} index={index} onSelect={select} view={view} reduced={reduced} ambient={ambient} layers={layers} playing={playing} speed={speed} />

          <aside className="signal-readouts" aria-label="Selected month observations">
            <div className="locator"><div className="mini-section-label"><span>LOCATOR</span><span>ISO {country.iso}</span></div><GeoLocator iso={country.iso} /></div>
            <div className="readout-date"><span>INSPECTION DATE</span><h3 key={current.date} className="fx-swap">{fmt(current.date)}</h3></div>
            {CHANNELS.map((ch, i) => (
              <div className="channel-readout" key={ch.key} style={{ "--channel": ch.color }}>
                <div><span>0{i + 1} / {ch.short}</span><strong key={current.date} className="fx-swap">{current[ch.key].toLocaleString("en-GB")}</strong></div>
                <Spark values={rows.map((r) => r[ch.key])} index={index} color={ch.color} />
                <small>{summary[i].total.toLocaleString("en-GB")} / trailing {Math.min(index + 1, 12)} months</small>
              </div>
            ))}
            <div className="month-event"><span className="eyebrow">COUP RECORD / A–C</span>
              {inMonth.length ? inMonth.map((e) => <p key={e.id}>{e.type === "riuscito" ? "◆" : "◇"} {e.prec === "month" ? e.date.slice(0, 7) : e.date}<br />{TYPE_LABEL[e.type]}</p>) : <p>No attempt recorded in this month.</p>}
            </div>
          </aside>
        </div>

        <div className="fx-console">
          <div className="fx-scrub">
            <label htmlFor="signal-month"><b key={current.date} className="fx-swap">{fmt(current.date)}</b><span>{rows[0].date} — {rows.at(-1).date}</span></label>
            <input id="signal-month" type="range" min="0" max={rows.length - 1} value={index} onChange={(e) => select(Number(e.target.value))} />
            <button onClick={() => { setCursor(null); setPlaying(false); }}>LATEST ↗</button>
          </div>
          <div className="fx-spectro" aria-label="Monthly intensity by signal">
            {CHANNELS.map((ch) => { const max = Math.max(1, ...rows.map((r) => r[ch.key])); return (
              <div className="fx-spectro-row" key={ch.key}>
                <span style={{ color: ch.color }}>{ch.short.slice(0, 3)}</span>
                <div>{rows.map((r, i) => (
                  <button key={r.date} tabIndex={index === i ? 0 : -1} aria-label={`${ch.name}, ${fmt(r.date)}: ${r[ch.key]}`} title={`${fmt(r.date)} · ${r[ch.key]}`}
                          onClick={() => select(i)}
                          onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); select(Math.max(0, Math.min(rows.length - 1, index + (e.key === "ArrowRight" ? 1 : -1)))); } }}
                          className={index === i ? "active" : ""} style={{ background: ch.color, opacity: 0.06 + 0.94 * Math.log1p(r[ch.key]) / Math.log1p(max) }} />
                ))}</div>
              </div>); })}
          </div>
          <div className="fx-logs">
            <div className="fx-log fx-analysis" aria-live="off">
              <h4>ANALYSIS LOG</h4>
              {log.map((l) => <p key={l.id} className="fx-swap"><span>{l.time}</span><span>{l.tag}</span><span>{l.text}</span></p>)}
            </div>
            <div className="fx-log">
              <h4>EVENT STREAM / A–C · {inWindow.length} IN WINDOW</h4>
              {inWindow.length ? inWindow.slice(-5).reverse().map((e) => (
                <button key={e.id} onClick={() => select(rows.findIndex((r) => r.date === e.date.slice(0, 7)))}>
                  <span>{e.prec === "month" ? e.date.slice(0, 7) : e.date}</span><span>{e.type === "riuscito" ? "◆" : "◇"} {TYPE_LABEL[e.type].toUpperCase()}</span><span>{e.conf}</span>
                </button>)) : <p>No recorded attempts in this window.</p>}
            </div>
            <div className="fx-log">
              <h4>MODEL CONTRIBUTIONS / LOG-ODDS</h4>
              {drivers.slice(0, 4).map((d) => <p key={d.label}><span>{labelEn(d.label)}</span><b className={d.contrib > 0 ? "positive" : "negative"}>{d.contrib > 0 ? "+" : ""}{d.contrib.toFixed(2)}</b></p>)}
              <Link href="/metodo">MODEL DOCUMENTATION ↗</Link>
            </div>
          </div>
        </div>

        <details className="encoding-notes"><summary>READING THIS INSTRUMENT <span>ENCODING / SOURCES / LIMITS</span></summary>
          <p>The field stacks three monthly signals, each as log(1 + count) normalized to its own maximum in the window: protests and riots, political violence, reported fatalities. Height at a month is the sum of the three; colour follows height, from deep red at the base to white at the country&apos;s peak. Particles are a denser rendering of that same profile and add no observations. Scatter above the surface grows with month-to-month change, and lilac particles mark that dispersion; neither is a forecast. Thin contours trace each signal&apos;s share of the stack. The temporal atlas bends the same matter into a ring, with the territory at the centre as context rather than event locations. Diamonds mark recorded successful (◆) and failed (◇) coups with A–C confidence and dates known to at least the month. The forecast is the latest model estimate and does not change with the cursor. Motion is ambient only and never alters values.</p>
        </details>
      </>}
    </div>
  );
}

function Spark({ values, index, color }) {
  const max = Math.max(1, ...values), x = (i) => Math.round((i / Math.max(1, values.length - 1)) * 16000) / 100, y = (v) => Math.round((30 - (Math.log1p(v) / Math.log1p(max)) * 26) * 100) / 100;
  const path = values.map((v, i) => `${i ? "L" : "M"}${x(i)},${y(v)}`).join(" ");
  return (
    <svg viewBox="0 0 160 34" aria-hidden="true">
      <path d={`${path} L160,33 L0,33 Z`} fill={color} opacity=".06" />
      <path d={path} fill="none" stroke={color} strokeWidth=".7" />
      <line className="fx-glide" x1={x(index)} x2={x(index)} y1="0" y2="34" stroke="#fff6dc" strokeWidth=".5" />
      <circle className="fx-glide" cx={x(index)} cy={y(values[index])} r="1.8" fill={color} />
    </svg>
  );
}
