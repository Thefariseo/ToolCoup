"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tip, useTip } from "@/components/Tooltip";
import WorldMap from "@/components/WorldMap";
import { fmtEventDate, fmtMonth, num, parseDate, pct, TYPE_LABEL } from "@/lib/format";

const WINDOW = 10; // anni considerati per il colore della mappa storica
const HIST_BREAKS = [1, 2, 3, 5, 8]; // attempts nel decennio -> classe di colore
const HIST_LABELS = ["1", "2", "3–4", "5–7", "8 or more"];

export default function WorldView({ countries, meta, initialCoups }) {
  const [mode, setMode] = useState("risk");
  const view = "map";
  const [year, setYear] = useState(1973);
  const [playing, setPlaying] = useState(false);
  const [conf, setConf] = useState("C");
  const [plots, setPlots] = useState(false);
  const [coups, setCoups] = useState(initialCoups);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(countries.find(c => !c.historical)?.slug || null);
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false); // the monitor opens on the top of the ranking; the rest is one click or a search away
  const [tip, showTip, hideTip] = useTip();
  const loaded = useRef("C|false"); // filtri con cui sono stati caricati gli eventi iniziali

  const minYear = 1900;
  const maxYear = Number(meta.data_end.slice(0, 4));
  const ranked = useMemo(() => countries.filter((c) => !c.historical), [countries]);
  const byIso = useMemo(() => new Map(ranked.filter((c) => c.iso).map((c) => [c.iso, c])), [ranked]);
  const bySlug = useMemo(() => new Map(countries.map((c) => [c.slug, c])), [countries]);
  const maxRisk = ranked[0]?.risk || 1;
  const sel = selected ? bySlug.get(selected) : null;

  // gli eventi arrivano dall'API quando cambiano i filtri
  useEffect(() => {
    const key = `${conf}|${plots}`;
    if (loaded.current === key) return;
    const ctl = new AbortController();
    setLoading(true);
    const types = plots ? "riuscito,fallito,complotto" : "riuscito,fallito";
    fetch(`/api/coups?conf=${conf}&type=${types}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((d) => { loaded.current = key; setCoups(d.events); setLoading(false); })
      .catch((e) => { if (e.name !== "AbortError") setLoading(false); });
    return () => ctl.abort();
  }, [conf, plots]);

  // riproduzione automatica
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setYear((y) => {
        if (y >= maxYear) { setPlaying(false); return y; }
        return y + 1;
      });
    }, 550);
    return () => clearInterval(id);
  }, [playing, maxYear]);

  const perYear = useMemo(() => {
    const m = new Map();
    for (const e of coups) {
      if (!m.has(e.year)) m.set(e.year, []);
      m.get(e.year).push(e);
    }
    return m;
  }, [coups]);
  const yearEvents = perYear.get(year) || [];

  const windowCount = useMemo(() => {
    const m = new Map();
    for (let y = year - WINDOW + 1; y <= year; y++) {
      for (const e of perYear.get(y) || []) {
        if (e.type !== "complotto" && e.iso) m.set(e.iso, (m.get(e.iso) || 0) + 1);
      }
    }
    return m;
  }, [perYear, year]);

  const dots = useMemo(() => {
    const groups = new Map();
    for (const e of yearEvents) {
      if (!e.iso) continue;
      if (!groups.has(e.iso)) groups.set(e.iso, []);
      groups.get(e.iso).push(e);
    }
    return [...groups.values()].flatMap((g) => g.map((e, i) => ({ iso: e.iso, type: e.type, i, n: g.length })));
  }, [yearEvents]);

  const riskBreaks = [0.5, 1, 2, 4, 8].map((k) => k * meta.base_rate);
  const cls = (v, breaks) => breaks.filter((b) => v >= b).length;
  const classOf = (iso) => {
    if (!iso) return "";
    if (mode === "risk") return byIso.has(iso) ? `q${cls(byIso.get(iso).risk, riskBreaks)}` : "";
    const n = windowCount.get(iso) || 0;
    return n ? `q${cls(n, HIST_BREAKS)}` : "";
  };
  const active = (iso) => byIso.has(iso);

  function hover(evt, iso, name) {
    const c = iso && byIso.get(iso);
    if (mode === "risk") {
      showTip(evt, c ? (<><b>{c.name}</b>Risk {pct(c.risk)} · {c.rank} / {ranked.length}</>)
                     : (<><b>{name}</b><span className="t2">not covered</span></>));
    } else {
      const n = (iso && windowCount.get(iso)) || 0;
      const now = yearEvents.filter((e) => e.iso === iso);
      showTip(evt, (<>
        <b>{c ? c.name : name}</b>
        {n} {n === 1 ? "attempt" : "attempts"} between {year - WINDOW + 1} and {year}
        {now.length > 0 && <><br /><span className="t2">In {year}: {now.map((e) => TYPE_LABEL[e.type].toLowerCase()).join(", ")}</span></>}
      </>));
    }
  }

  const list = useMemo(() => {
    const n = q.trim().toLowerCase();
    return ranked.filter((c) => !n || c.name.toLowerCase().includes(n) || (c.region || "").toLowerCase().includes(n));
  }, [ranked, q]);

  const succ = yearEvents.filter((e) => e.type === "riuscito").length;
  const fail = yearEvents.filter((e) => e.type === "fallito").length;
  const from = parseDate(meta.forecast_from), to = parseDate(meta.forecast_to);

  return (
    <main className="console">
      <div className="console-title"><div><p className="eyebrow">STRATEGIC RISK / {meta.demo ? "DEMO" : "RESEARCH EDITION"}</p><h1>World <span>map</span></h1></div><div className="edition"><i /> DATA THROUGH {meta.data_end}<small>ACLED × HISTORICAL EVIDENCE</small></div></div>
      <div className="telemetry" aria-label="Dataset overview">
        {[["COVERED COUNTRIES", num(meta.n_countries)], ["ACLED RECORDS", num(meta.n_events)], ["HISTORICAL WINDOW", `${meta.history_from || 1900}—${maxYear}`], ["FORECAST HORIZON", `${meta.horizon} MONTHS`], ["BASE RATE", pct(meta.base_rate)]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
      </div>
    <div className="world">
      <div className="world-main">
        <div className="instrument-head"><span><i /> 01 / ANALYTICAL WORKSPACE</span><span>{mode === "risk" ? "FORECAST" : "ARCHIVE"} · {mode === "risk" ? `${meta.forecast_from} → ${meta.forecast_to}` : year}</span></div>
        <div className={`map-wrap ${mode === "risk" && view === "field" ? "with-field" : ""}`}>
          {<WorldMap
            classOf={classOf} active={active} selectedIso={sel?.iso} dots={mode === "history" ? dots : []}
            onSelect={(iso) => setSelected(byIso.get(iso).slug)} onHover={hover} onLeave={hideTip}
            label={mode === "risk" ? "Country coup-risk map" : `Coup events in ${year}`}
          />}
          <div className="map-top">
            
            <div className="seg" role="group" aria-label="Analysis mode">
              <button aria-pressed={mode === "risk"} onClick={() => { setMode("risk"); setPlaying(false); }}>Forecast</button>
              <button aria-pressed={mode === "history"} onClick={() => setMode("history")}>Historical archive</button>
            </div>
          </div>
          <div className={`map-legend ${mode === "risk" && view === "field" ? "field-legend" : ""}`}>
            {mode === "risk" ? (<>
              <b>Probability of a coup attempt by {fmtMonth(to)}</b>
              <div className="legend-row">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i}><i className={`sw q${i}`} style={{ background: `var(--seq-${i + 1})` }} />
                    {i === 0 ? `< ${pct(riskBreaks[0])}` : i === 5 ? `> ${pct(riskBreaks[4])}` : `${pct(riskBreaks[i - 1])}–${pct(riskBreaks[i])}`}
                  </span>
                ))}
              </div>
            </>) : (<>
              <b>Coup attempts in the 10 years through {year}</b>
              <div className="legend-row">
                {HIST_LABELS.map((l, i) => (
                  <span key={l}><i className="sw" style={{ background: `var(--seq-${i + 2})` }} />{l}</span>
                ))}
              </div>
              <div className="legend-row" style={{ marginTop: 4 }}>
                <span><i className="dot-sw" />successful in {year}</span>
                <span><i className="dot-sw hollow" />failed in {year}</span>
              </div>
            </>)}
          </div>
        </div>
        {mode === "risk" && <div className="signal-deck"><div><p className="eyebrow">02 / CROSS-COUNTRY DISTRIBUTION</p><div className="risk-spectrum" aria-label="Country risk in descending order">{ranked.map(c => <button key={c.slug} aria-label={`${c.name}: ${pct(c.risk)}`} title={`${c.name}: ${pct(c.risk)}`} onClick={() => setSelected(c.slug)} style={{height: `${Math.max(4, c.risk / maxRisk * 68)}px`}} className={selected === c.slug ? "selected" : ""} />)}</div><div className="signal-foot"><span>ONE BAR / ONE COUNTRY</span><span>{ranked.length} COUNTRIES →</span></div></div><div className="reading"><p className="eyebrow">03 / MODEL INTERPRETATION</p><p>Inspect the evidence behind the estimate.</p><small>Select a country to connect monthly signals, historical events and model contributions.</small><Link href="/metodo">Methodology & validation ↗</Link></div></div>}
        {mode === "history" && (
          <TimeBar year={year} setYear={(y) => { setYear(y); setPlaying(false); }} min={minYear} max={maxYear}
                   perYear={perYear} playing={playing}
                   toggle={() => { if (!playing && year >= maxYear) setYear(minYear); setPlaying((p) => !p); }} />
        )}
      </div>

      <aside className="panel" aria-label="Country monitor"><div className="instrument-head"><span>COUNTRY MONITOR</span><span>↓ PROBABILITY</span></div>
        {sel && (
          <div className="panel-sec">
            <div className="card-sel">
              <h3>{sel.name}</h3>
              <div className="row">
                {sel.risk != null && <span>Risk {pct(sel.risk)}{sel.risk_lo != null && ` (range ${pct(sel.risk_lo)} – ${pct(sel.risk_hi)})`} · {sel.rank} / {ranked.length}</span>}
                <span>{sel.attempts} {sel.attempts === 1 ? "attempt" : "attempts"} since 1900</span>
              </div>
              <Link className="btn primary" href={`/?c=${sel.slug}&v=field`}>Open in instrument</Link>{" "}<Link className="btn" href={`/paese/${sel.slug}`}>Dossier</Link>{" "}
              <button className="btn" onClick={() => setSelected(null)}>Clear</button>
            </div>
          </div>
        )}
        {mode === "risk" ? (<>
          <div className="panel-sec">
            <h2>Country monitor</h2>
            <p className="sub">
              Estimated probability of at least one attempt between {fmtMonth(from)} and {fmtMonth(to)}. The reference base rate since 2000 is {pct(meta.base_rate)}.
            </p>
            <input className="input" style={{ marginTop: 10 }} type="search" placeholder="Filter country or region…"
                   aria-label="Filter country monitor" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="monitor-columns"><span>RK / COUNTRY</span><span>P(ATTEMPT)</span></div><ol className="rank-list">
            {(showAll || q.trim() ? list : list.slice(0, 24)).map((c) => (
              <li key={c.slug}>
                <button className={selected === c.slug ? "sel" : ""} onClick={() => setSelected(c.slug)}>
                  <span className="n">{c.rank}</span>
                  <span>{c.name}<small>{c.region}</small></span>
                  <span className="riskbar"><i style={{ width: `${(c.risk / maxRisk) * 100}%` }} /></span>
                  <span className="tnum" style={{ textAlign: "right" }}>{pct(c.risk)}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="empty">No matching countries.</li>}
          </ol>
          {!q.trim() && list.length > 24 && (
            <button className="fx-more" onClick={() => setShowAll(!showAll)}>{showAll ? "↑ SHOW TOP 24" : `↓ SHOW ALL ${list.length} COUNTRIES`}</button>
          )}
        </>) : (<>
          <div className="panel-sec">
            <h2>{year}</h2>
            <div className="kpi-row">
              <div><b>{succ}</b><span>successful</span></div>
              <div><b>{fail}</b><span>failed</span></div>
              {plots && <div><b>{yearEvents.length - succ - fail}</b><span>plots</span></div>}
            </div>
            <div className="filters">
              <label className="check">Confidence{" "}
                <select className="select" value={conf} onChange={(e) => setConf(e.target.value)}>
                  <option value="A">high only (A)</option>
                  <option value="B">high and good (A–B)</option>
                  <option value="C">through medium (A–C)</option>
                  <option value="D">all levels (A–D)</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={plots} onChange={(e) => setPlots(e.target.checked)} /> plots
              </label>
            </div>
            {year < 1946 && (
              <p className="sub" style={{ marginTop: 8 }}>
                Failed coups before 1946 are incompletely recorded.
              </p>
            )}
          </div>
          <ul className="event-list" aria-busy={loading}>
            {yearEvents.map((e) => (
              <li key={e.id}>
                <Link href={`/paese/${e.slug}`}>
                  <span>{e.name}<small>{fmtEventDate(e)}</small></span>
                  <span className="badges">
                    <span className={`badge ${e.type}`}>{TYPE_LABEL[e.type]}</span>
                    <span className="badge conf" title="Confidence">{e.conf}</span>
                  </span>
                </Link>
              </li>
            ))}
            {yearEvents.length === 0 && <li className="empty">No events recorded in {year} with these filters.</li>}
          </ul>
        </>)}
      </aside>
      <Tip tip={tip} />
    </div><footer className="console-footer"><span><i /> {meta.demo ? "SYNTHETIC DATA" : "RESEARCH DATA"} · GENERATED {meta.generated}</span><span>TOOLCOUP / HISTORICAL EVIDENCE / FORECASTING</span></footer></main>
  );
}

function TimeBar({ year, setYear, min, max, perYear, playing, toggle }) {
  const years = [];
  for (let y = min; y <= max; y++) years.push(y);
  const counts = years.map((y) => {
    const ev = perYear.get(y) || [];
    const s = ev.filter((e) => e.type === "riuscito").length;
    return { y, s, f: ev.filter((e) => e.type === "fallito").length };
  });
  const top = Math.max(1, ...counts.map((c) => c.s + c.f));
  const n = years.length;
  return (
    <div className="timebar">
      <div className="timebar-row">
        <button className="btn" onClick={toggle} aria-label={playing ? "Stop" : "Start playback"}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <div className="year-big" aria-live="polite">{year}</div>
        <div className="slider-wrap">
          <svg viewBox={`0 0 ${n} ${top}`} preserveAspectRatio="none" aria-hidden="true">
            {counts.map((c, i) => (
              <g key={c.y} className={c.y === year ? "" : "bar-dim"}>
                <rect className="bar-s" x={i + 0.12} width={0.76} y={top - c.s} height={c.s} />
                <rect className="bar-f" x={i + 0.12} width={0.76} y={top - c.s - c.f} height={c.f} />
              </g>
            ))}
          </svg>
          <input type="range" min={min} max={max} step={1} value={year} aria-label="Year"
                 onChange={(e) => setYear(Number(e.target.value))} />
          <div className="slider-ticks">
            {[1900, 1925, 1950, 1975, 2000, max].map((t) => <span key={t}>{t}</span>)}
          </div>
        </div>
      </div>
      <div className="legend" style={{ margin: "6px 0 0" }}>
        <span><i className="sw" style={{ background: "var(--series-1)" }} />successful per year</span>
        <span><i className="sw" style={{ background: "var(--series-2)" }} />failed per year</span>
        <span>{num(counts.reduce((a, c) => a + c.s + c.f, 0))} attempts in total</span>
      </div>
    </div>
  );
}
