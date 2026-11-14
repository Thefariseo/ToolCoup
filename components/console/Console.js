"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Stage, { GROUP_NAME } from "@/components/console/Stage";
import Strip from "@/components/console/Strip";
import { labelEn } from "@/lib/english";
import { fmtEventDate, pct, TYPE_LABEL } from "@/lib/format";

const VIEWS = [
  { key: "field", n: "1", name: "SIGNAL FIELD", line: "Where. Every country's 6-month probability of a coup attempt. Colour, plume height and pulse rate all encode the same number." },
  { key: "atlas", n: "2", name: "TEMPORAL ATLAS", line: "When. One ridge per country, 1975 → today: the model's out-of-sample forecast, quarter by quarter. Height = probability." },
  { key: "trace", n: "3", name: "MODEL TRACE", line: "Why. Seven variable groups feed the score. Stream width = size of the push, amber raises, cyan lowers (log-odds, linear component)." },
];
const cache = new Map();

export default function Console({ list, meta, auc, featureGroup, registry }) {
  const bySlug = useMemo(() => new Map(list.map((c) => [c.slug, c])), [list]);
  const [slug, setSlug] = useState(list[0]?.slug), [view, setView] = useState("field");
  const [plane, setPlane] = useState(false), [live, setLive] = useState(true), [q, setQ] = useState(""), [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null), [atlas, setAtlas] = useState(null), [ready, setReady] = useState(false);
  const filterRef = useRef(null), listRef = useRef(null);
  const selected = bySlug.get(slug) || list[0];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (bySlug.has(p.get("c"))) setSlug(p.get("c"));
    if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLive(false);
    setReady(true);
  }, [bySlug]);
  useEffect(() => { if (ready) window.history.replaceState(null, "", `?c=${slug}&v=${view}`); }, [ready, slug, view]);

  useEffect(() => {
    let on = true; setFocus(null);
    if (cache.has(slug)) { setDetail(cache.get(slug)); return; }
    setDetail(null);
    fetch(`/api/countries/${slug}`).then((r) => r.json()).then((d) => { cache.set(slug, d); if (on) setDetail(d); }).catch(() => {});
    return () => { on = false; };
  }, [slug]);
  useEffect(() => { if (view === "atlas" && !atlas) fetch("/api/atlas").then((r) => r.json()).then(setAtlas).catch(() => {}); }, [view, atlas]);

  const shown = useMemo(() => { const n = q.trim().toLowerCase(); return n ? list.filter((c) => c.name.toLowerCase().includes(n) || c.region.toLowerCase().includes(n)) : list; }, [list, q]);
  const step = useCallback((k) => {
    const i = shown.findIndex((c) => c.slug === slug), next = shown[Math.max(0, Math.min(shown.length - 1, (i < 0 ? 0 : i) + k))];
    if (next) setSlug(next.slug);
  }, [shown, slug]);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Escape" && typing) { e.target.blur(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
      else if (e.key === "/") { e.preventDefault(); filterRef.current?.focus(); }
      else if (e.key === "g") setPlane((v) => !v);
      else if (e.key === "m") setLive((v) => !v);
      else if (VIEWS.some((v) => v.n === e.key)) setView(VIEWS.find((v) => v.n === e.key).key);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [step]);
  useEffect(() => {                      // keep the selected row in view without scrolling the page itself
    const ol = listRef.current, li = ol?.querySelector(".on")?.parentElement; if (!li) return;
    if (li.offsetTop < ol.scrollTop) ol.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTop = li.offsetTop + li.offsetHeight - ol.clientHeight;
  }, [slug]);

  const v = VIEWS.find((x) => x.key === view);
  const delta = selected.risk_3m_ago == null ? null : selected.risk - selected.risk_3m_ago;
  const drivers = (detail?.drivers || []).filter((d) => !focus || featureGroup[d.label] === focus);
  const top = Math.max(0.01, ...(detail?.drivers || []).map((d) => Math.abs(d.contrib)));
  const scaleMax = Math.max(list[0].risk_hi || list[0].risk, 0.01);

  return (
    <main className="cx">
      <aside className="cx-list" aria-label="Watchlist">
        <header><h2>WATCHLIST <em>{shown.length}</em></h2><span>P(ATTEMPT) · {meta.horizon} MO</span></header>
        <input ref={filterRef} className="cx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="filter country / region    [/]" aria-label="Filter countries" />
        <ol ref={listRef}>
          {shown.map((c) => {
            const d = c.risk_3m_ago == null ? 0 : c.risk - c.risk_3m_ago;
            return (
              <li key={c.slug}>
                <button className={c.slug === slug ? "on" : ""} onClick={() => setSlug(c.slug)} aria-current={c.slug === slug}>
                  <span className="n">{String(c.pos).padStart(3, "0")}</span><span className="name">{c.name}</span>
                  <span className={`d ${d > 0.001 ? "up" : d < -0.001 ? "down" : ""}`}>{d > 0.001 ? "▲" : d < -0.001 ? "▼" : "·"}</span>
                  <span className="v">{pct(c.risk)}</span>
                  <i style={{ width: `${Math.sqrt(c.risk / list[0].risk) * 100}%` }} />
                </button>
              </li>
            );
          })}
          {!shown.length && <li className="cx-none">NO MATCH</li>}
        </ol>
      </aside>

      <section className="cx-main" aria-label={v.name}>
        <nav className="cx-tabs" aria-label="Views">
          {VIEWS.map((x) => <button key={x.key} className={view === x.key ? "on" : ""} onClick={() => setView(x.key)} aria-pressed={view === x.key}><kbd>{x.n}</kbd>{x.name}</button>)}
          <span className="cx-tabs-fill" />
          {view === "field" && <button className={plane ? "on" : ""} onClick={() => setPlane(!plane)} aria-pressed={plane}><kbd>G</kbd>{plane ? "PLANE" : "GLOBE"}</button>}
          <button className={live ? "on" : ""} onClick={() => setLive(!live)} aria-pressed={live}><kbd>M</kbd>MOTION {live ? "ON" : "OFF"}</button>
        </nav>
        <div className="cx-stage-wrap">
          <Stage view={view} list={list} selected={selected} detail={detail} atlas={atlas} plane={plane} live={live} onSelect={setSlug} focus={focus} onFocus={setFocus} />
          <p className="cx-caption">{v.line}</p>
          {view !== "trace" && (
            <div className="cx-legend" aria-hidden="true"><span>0</span><i /><span>{pct(view === "field" ? list[0].risk : 0.3, 0)}{view === "field" ? "" : "+"}</span></div>
          )}
          {view === "trace" && <div className="cx-legend txt" aria-hidden="true"><b className="up">■ RAISES</b><b className="down">■ LOWERS</b></div>}
        </div>
        <Strip country={selected} detail={detail} />
      </section>

      <aside className="cx-read" aria-label="Selected country">
        <header><h2>{selected.name.toUpperCase()}</h2><span>{selected.region}</span></header>
        <div className="cx-p">
          <b>{pct(selected.risk)}</b>
          <span>coup attempt · {meta.forecast_from} → {meta.forecast_to}</span>
          {selected.risk_lo != null && (
            <div className="cx-ci" title="80% interval from country-resampled refits">
              <i style={{ left: `${(selected.risk_lo / scaleMax) * 100}%`, width: `${((selected.risk_hi - selected.risk_lo) / scaleMax) * 100}%` }} />
              <u style={{ left: `${(selected.risk / scaleMax) * 100}%` }} />
            </div>
          )}
          {selected.risk_lo != null && <span>80% interval {pct(selected.risk_lo)} – {pct(selected.risk_hi)}</span>}
        </div>
        <dl className="cx-kv">
          <div><dt>RANK</dt><dd>{selected.pos} / {list.length}</dd></div>
          <div><dt>VS BASE RATE</dt><dd>{(selected.risk / meta.base_rate).toFixed(1)}×</dd></div>
          <div><dt>Δ 3 MONTHS</dt><dd className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${(delta * 100).toFixed(2)} pp`}</dd></div>
          <div><dt>ATTEMPTS 1900→</dt><dd>{selected.attempts} <small>({selected.successes} ok)</small></dd></div>
          <div><dt>LAST</dt><dd>{selected.last ? <>{fmtEventDate({ date: selected.last.date, prec: "day" })} <small>{TYPE_LABEL[selected.last.type]?.toLowerCase()}</small></> : "none recorded"}</dd></div>
        </dl>
        <section className="cx-drivers">
          <header><h3>DRIVERS {focus && <em>{GROUP_NAME[focus]}</em>}</h3>{focus ? <button onClick={() => setFocus(null)}>CLEAR ×</button> : <span>log-odds</span>}</header>
          {!detail && <p className="cx-wait">RETRIEVING<i>_</i></p>}
          {detail && !drivers.length && <p className="cx-note">{focus ? "None of the six largest drivers belongs to this group." : "No driver decomposition exported for this country."}</p>}
          <ul>
            {drivers.map((d) => (
              <li key={d.label} className={d.contrib > 0 ? "up" : "down"}>
                <span>{labelEn(d.label)}</span><b>{d.contrib > 0 ? "+" : ""}{d.contrib.toFixed(2)}</b>
                <i style={{ width: `${(Math.abs(d.contrib) / top) * 100}%` }} />
              </li>
            ))}
          </ul>
          <p className="cx-note">Six largest terms of the logistic component. Associations in the training data, not causes.</p>
        </section>
        <nav className="cx-links">
          <Link href={`/paese/${selected.slug}`}>COUNTRY DOSSIER →</Link>
          <Link href="/registry">FORECAST REGISTRY →</Link>
          <Link href="/metodo">METHOD & VALIDATION →</Link>
        </nav>
      </aside>

      <footer className="cx-status">
        <span><i className="cx-led" />ISSUE {registry?.latest || meta.forecast_from} · #{String(registry?.count || 1).padStart(3, "0")}</span>
        <span>DATA THROUGH {meta.data_end}</span>
        <span>WINDOW {meta.forecast_from} → {meta.forecast_to}</span>
        <span>OUT-OF-SAMPLE AUC {auc?.toFixed(3)} · 1975→</span>
        <span>{meta.n_countries} COUNTRIES · {meta.n_features} VARIABLES</span>
        <span className="r">MONTHLY SNAPSHOT — NOT A LIVE FEED · ↑↓ COUNTRY · 1 2 3 VIEW</span>
      </footer>
    </main>
  );
}
