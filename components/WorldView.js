"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tip, useTip } from "@/components/Tooltip";
import WorldMap from "@/components/WorldMap";
import { fmtEventDate, fmtMonth, num, parseDate, pct, TYPE_LABEL } from "@/lib/format";

const WINDOW = 10; // anni considerati per il colore della mappa storica
const HIST_BREAKS = [1, 2, 3, 5, 8]; // tentativi nel decennio -> classe di colore
const HIST_LABELS = ["1", "2", "3–4", "5–7", "8 o più"];

export default function WorldView({ countries, meta, initialCoups }) {
  const [mode, setMode] = useState("risk");
  const [year, setYear] = useState(1973);
  const [playing, setPlaying] = useState(false);
  const [conf, setConf] = useState("C");
  const [plots, setPlots] = useState(false);
  const [coups, setCoups] = useState(initialCoups);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);
  const [q, setQ] = useState("");
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
      showTip(evt, c ? (<><b>{c.name}</b>Rischio {pct(c.risk)} · {c.rank}° su {ranked.length}</>)
                     : (<><b>{name}</b><span className="t2">non coperto</span></>));
    } else {
      const n = (iso && windowCount.get(iso)) || 0;
      const now = yearEvents.filter((e) => e.iso === iso);
      showTip(evt, (<>
        <b>{c ? c.name : name}</b>
        {n} {n === 1 ? "tentativo" : "tentativi"} tra {year - WINDOW + 1} e {year}
        {now.length > 0 && <><br /><span className="t2">Nel {year}: {now.map((e) => TYPE_LABEL[e.type].toLowerCase()).join(", ")}</span></>}
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
      <div className="console-title"><div><p className="eyebrow">GEOPOLITICAL INTELLIGENCE / {meta.demo ? "DEMO" : "RESEARCH EDITION"}</p><h1>Osservatorio <span>golpe.</span></h1></div><div className="edition"><i /> DATI AL {meta.data_end}<small>ACLED × DATABASE STORICO</small></div></div>
      <div className="telemetry" aria-label="Panoramica dei dati">
        {[["01 / PAESI MONITORATI", num(meta.n_countries)], ["02 / EVENTI ACLED", num(meta.n_events)], ["03 / ARCHIVIO", `${meta.history_from || 1900}—${maxYear}`], ["04 / ORIZZONTE", `${meta.horizon} MESI`], ["05 / TASSO BASE", pct(meta.base_rate)]].map(([label, value]) => <div key={label}><span>{label}</span><b>{value}</b></div>)}
      </div>
    <div className="world">
      <div className="world-main">
        <div className="instrument-head"><span><i /> A / ATLANTE GLOBALE</span><span>{mode === "risk" ? "PREVISIONE" : "ARCHIVIO"} · {mode === "risk" ? `${meta.forecast_from} → ${meta.forecast_to}` : year}</span></div>
        <div className="map-wrap">
          <WorldMap
            classOf={classOf} active={active} selectedIso={sel?.iso} dots={mode === "history" ? dots : []}
            onSelect={(iso) => setSelected(byIso.get(iso).slug)} onHover={hover} onLeave={hideTip}
            label={mode === "risk" ? "Mappa del rischio di golpe per paese" : `Mappa dei golpe nel ${year}`}
          />
          <div className="map-top">
            <div className="seg" role="group" aria-label="Cosa mostra la mappa">
              <button aria-pressed={mode === "risk"} onClick={() => { setMode("risk"); setPlaying(false); }}>01 / Previsione</button>
              <button aria-pressed={mode === "history"} onClick={() => setMode("history")}>02 / Archivio storico</button>
            </div>
          </div>
          <div className="map-legend">
            {mode === "risk" ? (<>
              <b>Probabilità di un tentativo entro {fmtMonth(to)}</b>
              <div className="legend-row">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <span key={i}><i className={`sw q${i}`} style={{ background: `var(--seq-${i + 1})` }} />
                    {i === 0 ? `< ${pct(riskBreaks[0])}` : i === 5 ? `> ${pct(riskBreaks[4])}` : `${pct(riskBreaks[i - 1])}–${pct(riskBreaks[i])}`}
                  </span>
                ))}
              </div>
            </>) : (<>
              <b>Tentativi di golpe nei 10 anni fino al {year}</b>
              <div className="legend-row">
                {HIST_LABELS.map((l, i) => (
                  <span key={l}><i className="sw" style={{ background: `var(--seq-${i + 2})` }} />{l}</span>
                ))}
              </div>
              <div className="legend-row" style={{ marginTop: 4 }}>
                <span><i className="dot-sw" />riuscito nel {year}</span>
                <span><i className="dot-sw hollow" />fallito nel {year}</span>
              </div>
            </>)}
          </div>
        </div>
        {mode === "risk" && <div className="signal-deck"><div><p className="eyebrow">B / DISTRIBUZIONE DEL RISCHIO</p><div className="risk-spectrum" aria-label="Rischio per paese in ordine decrescente">{ranked.map(c => <button key={c.slug} aria-label={`${c.name}: ${pct(c.risk)}`} title={`${c.name}: ${pct(c.risk)}`} onClick={() => setSelected(c.slug)} style={{height: `${Math.max(4, c.risk / maxRisk * 68)}px`}} className={selected === c.slug ? "selected" : ""} />)}</div><div className="signal-foot"><span>OGNI BARRA = UN PAESE</span><span>{ranked.length} OSSERVAZIONI →</span></div></div><div className="reading"><p className="eyebrow">C / LETTURA DEL MODELLO</p><p>Una probabilità, non una certezza.</p><small>Seleziona un paese per esplorare segnali, storia e fattori di rischio.</small><Link href="/metodo">Esamina metodo e limiti ↗</Link></div></div>}
        {mode === "history" && (
          <TimeBar year={year} setYear={(y) => { setYear(y); setPlaying(false); }} min={minYear} max={maxYear}
                   perYear={perYear} playing={playing}
                   toggle={() => { if (!playing && year >= maxYear) setYear(minYear); setPlaying((p) => !p); }} />
        )}
      </div>

      <aside className="panel" aria-label="Dettagli"><div className="instrument-head"><span>D / MONITOR PAESI</span><span>↓ RISCHIO</span></div>
        {sel && (
          <div className="panel-sec">
            <div className="card-sel">
              <h3>{sel.name}</h3>
              <div className="row">
                {sel.risk != null && <span>Rischio {pct(sel.risk)} · {sel.rank}° su {ranked.length}</span>}
                <span>{sel.attempts} {sel.attempts === 1 ? "tentativo" : "tentativi"} dal 1900</span>
              </div>
              <Link className="btn primary" href={`/paese/${sel.slug}`}>Apri la scheda</Link>{" "}
              <button className="btn" onClick={() => setSelected(null)}>Chiudi</button>
            </div>
          </div>
        )}
        {mode === "risk" ? (<>
          <div className="panel-sec">
            <h2>Rischio di golpe</h2>
            <p className="sub">
              Probabilità stimata di almeno un tentativo tra {fmtMonth(from)} e {fmtMonth(to)}. In un paese e mese
              qualsiasi è {pct(meta.base_rate)}.
            </p>
            <input className="input" style={{ marginTop: 10 }} type="search" placeholder="Filtra per paese o regione"
                   aria-label="Filtra la classifica" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <ol className="rank-list">
            {list.map((c) => (
              <li key={c.slug}>
                <button className={selected === c.slug ? "sel" : ""} onClick={() => setSelected(c.slug)}>
                  <span className="n">{c.rank}</span>
                  <span>{c.name}<small>{c.region}</small></span>
                  <span className="riskbar"><i style={{ width: `${(c.risk / maxRisk) * 100}%` }} /></span>
                  <span className="tnum" style={{ textAlign: "right" }}>{pct(c.risk)}</span>
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="empty">Nessun paese trovato.</li>}
          </ol>
        </>) : (<>
          <div className="panel-sec">
            <h2>{year}</h2>
            <div className="kpi-row">
              <div><b>{succ}</b><span>riusciti</span></div>
              <div><b>{fail}</b><span>falliti</span></div>
              {plots && <div><b>{yearEvents.length - succ - fail}</b><span>complotti</span></div>}
            </div>
            <div className="filters">
              <label className="check">Affidabilità{" "}
                <select className="select" value={conf} onChange={(e) => setConf(e.target.value)}>
                  <option value="A">solo alta (A)</option>
                  <option value="B">alta e buona (A–B)</option>
                  <option value="C">fino a media (A–C)</option>
                  <option value="D">tutte (A–D)</option>
                </select>
              </label>
              <label className="check">
                <input type="checkbox" checked={plots} onChange={(e) => setPlots(e.target.checked)} /> complotti
              </label>
            </div>
            {year < 1946 && (
              <p className="sub" style={{ marginTop: 8 }}>
                Prima del 1946 i golpe falliti sono registrati solo in parte.
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
                    <span className="badge conf" title="Affidabilità">{e.conf}</span>
                  </span>
                </Link>
              </li>
            ))}
            {yearEvents.length === 0 && <li className="empty">Nessun evento registrato nel {year} con questi filtri.</li>}
          </ul>
        </>)}
      </aside>
      <Tip tip={tip} />
    </div><footer className="console-footer"><span><i /> {meta.demo ? "DATI SINTETICI" : "DATI DI RICERCA"} · AGGIORNATO {meta.generated}</span><span>TOOLCOUP / ANALISI STORICA & FORECASTING</span></footer></main>
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
        <button className="btn" onClick={toggle} aria-label={playing ? "Ferma" : "Avvia lo scorrimento"}>
          {playing ? "❚❚ Pausa" : "▶ Avvia"}
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
          <input type="range" min={min} max={max} step={1} value={year} aria-label="Anno"
                 onChange={(e) => setYear(Number(e.target.value))} />
          <div className="slider-ticks">
            {[1900, 1925, 1950, 1975, 2000, max].map((t) => <span key={t}>{t}</span>)}
          </div>
        </div>
      </div>
      <div className="legend" style={{ margin: "6px 0 0" }}>
        <span><i className="sw" style={{ background: "var(--series-1)" }} />riusciti per anno</span>
        <span><i className="sw" style={{ background: "var(--series-2)" }} />falliti per anno</span>
        <span>{num(counts.reduce((a, c) => a + c.s + c.f, 0))} tentativi in totale</span>
      </div>
    </div>
  );
}
