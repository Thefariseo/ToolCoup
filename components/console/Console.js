"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "@/components/Flag";
import Stage, { GROUP_NAME } from "@/components/console/Stage";
import Strip from "@/components/console/Strip";
import Tour, { TOUR_KEY } from "@/components/console/Tour";
import { labelEn } from "@/lib/english";
import { fmtEventDate, pct, TYPE_LABEL } from "@/lib/format";

const VIEWS = [
  { key: "field", n: "1", name: "SIGNAL FIELD", line: "Where. Every country's 6-month probability of a coup attempt. Colour, plume height and pulse rate all encode the same number. Scroll to zoom, drag to rotate." },
  { key: "atlas", n: "2", name: "TEMPORAL ATLAS", line: "When. One ridge per country, 1975 → today: the model's out-of-sample forecast, quarter by quarter. Height = probability. The selected country is lit; the rest recede." },
  { key: "trace", n: "3", name: "MODEL TRACE", line: "Why. From the recent base rate to this country's forecast: a waterfall of swarm particles, one column per variable group. Amber columns stream up and raise the odds, cyan columns stream down and lower them; a taller column is a bigger push. The last column (ensemble) returns the figure to the published forecast; the vortex is the forecast itself. Click a column to list its drivers." },
];
const cache = new Map();

export default function Console({ list, meta, auc, featureGroup, registry }) {
  const bySlug = useMemo(() => new Map(list.map((c) => [c.slug, c])), [list]);
  const [slug, setSlug] = useState(list[0]?.slug), [view, setView] = useState("field");
  const [plane, setPlane] = useState(false), [live, setLive] = useState(true), [q, setQ] = useState(""), [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null), [atlas, setAtlas] = useState(null), [ready, setReady] = useState(false);
  const [dossier, setDossier] = useState({ state: "idle" }), [tour, setTour] = useState(false);
  const filterRef = useRef(null), listRef = useRef(null), stageApi = useRef(null);
  const selected = bySlug.get(slug) || list[0];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (bySlug.has(p.get("c"))) setSlug(p.get("c"));
    if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLive(false);
    try { if (p.get("tour") === "1" || !localStorage.getItem(TOUR_KEY)) setTour(true); } catch { /* storage blocked: skip the tour */ }
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
      else if (e.key === "+" || e.key === "=") stageApi.current?.zoom(1.4);
      else if (e.key === "-" || e.key === "_") stageApi.current?.zoom(1 / 1.4);
      else if (e.key === "0") stageApi.current?.reset();
      else if (e.key === "m") setLive((v) => !v);
      else if (e.key === "?") setTour(true);
      else if (VIEWS.some((v) => v.n === e.key)) setView(VIEWS.find((v) => v.n === e.key).key);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [step]);
  useEffect(() => {                      // keep the selected row in view without scrolling the page itself
    const ol = listRef.current, li = ol?.querySelector(".on")?.parentElement; if (!li) return;
    if (li.offsetTop < ol.scrollTop) ol.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTop = li.offsetTop + li.offsetHeight - ol.clientHeight;
  }, [slug]);

  const issue = registry?.latest || meta.forecast_from;
  async function downloadDossier() {
    const target = selected.slug;
    setDossier({ state: "busy", slug: target });
    try {
      const res = await fetch(`/api/dossier/${target}?issue=${issue}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
      a.href = url; a.download = `toolcoup-dossier-${target}-${issue}.pdf`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setDossier({ state: "idle" });
    } catch (e) {
      setDossier({ state: "error", slug: target, msg: e.message });
    }
  }
  const v = VIEWS.find((x) => x.key === view);
  const delta = selected.risk_3m_ago == null ? null : selected.risk - selected.risk_3m_ago;
  const drivers = (detail?.drivers || []).filter((d) => !focus || featureGroup[d.label] === focus);
  const top = Math.max(0.01, ...(detail?.drivers || []).map((d) => Math.abs(d.contrib)));
  const scaleMax = Math.max(list[0].risk_hi || list[0].risk, 0.01);

  return (
    <main className="cx">
      <Tour open={tour} onClose={() => setTour(false)} onView={setView} />
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
          <button onClick={() => setTour(true)} aria-label="Open the guide"><kbd>?</kbd>GUIDE</button>
        </nav>
        <div className="cx-stage-wrap">
          <Stage view={view} list={list} selected={selected} detail={detail} atlas={atlas} plane={plane} live={live} onSelect={setSlug} focus={focus} onFocus={setFocus} apiRef={stageApi} baseRate={meta.base_rate} />
          <p className="cx-caption">{v.line}</p>
          {view !== "trace" && (
            <div className="cx-legend" aria-hidden="true"><span>0</span><i /><span>{pct(view === "field" ? list[0].risk : 0.3, 0)}{view === "field" ? "" : "+"}</span></div>
          )}
          {view === "trace" && <div className="cx-legend txt" aria-hidden="true"><b className="up">■ RAISES</b><b className="down">■ LOWERS</b></div>}
        </div>
        <Strip country={selected} detail={detail} />
      </section>

      <aside className="cx-read" aria-label="Selected country">
        <header><h2 className="cx-flagrow"><Flag iso={selected.iso} height={14} />{selected.name.toUpperCase()}</h2><span>{selected.region}</span></header>
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
        {detail?.analysis && <section className="cx-country-context">
          <h3>COUNTRY CONTEXT</h3>
          <dl className="cx-kv">
            <div><dt>REGIONAL RANK</dt><dd>{detail.analysis.region.rank} / {detail.analysis.region.count}</dd></div>
            <div><dt>REGIONAL MEDIAN*</dt><dd>{pct(detail.analysis.region.median)}</dd></div>
            <div><dt>REGIME / LATEST DATA</dt><dd>{detail.diagnostics?.regime || "unavailable"}</dd></div>
          </dl>
          <p className="cx-note">*Other countries in the region. Annual regime records may lag current events.</p>
          <details><summary>Recent activity / 3 months</summary><dl className="cx-kv">{detail.analysis.signals.map((s) => <div key={s.key}><dt>{s.label}</dt><dd>{s.recentTotal ?? "—"}<small>{s.ratio != null ? ` / ${s.ratio.toFixed(1)}× baseline` : s.newActivity ? " / after zero baseline" : ""}</small></dd></div>)}</dl><p className="cx-note">Compared with the preceding 24 months. Counts depend on reporting coverage.</p></details>
          <Link href={`/paese/${selected.slug}#assessment`}>EXPLORE THE FULL ASSESSMENT →</Link>
        </section>}
        <div className="cx-dossier">
          <button onClick={downloadDossier} disabled={dossier.state === "busy"}>
            {dossier.state === "busy" ? <>COMPILING BRIEF<i>…</i> <small>≈ 30 s</small></> : <>COUNTRY BRIEF · PDF <span>↓</span></>}
          </button>
          {dossier.state === "error" && dossier.slug === selected.slug && <p role="alert">{dossier.msg}</p>}
          <p>Model figures and records from our database, plus headlines from allow-listed outlets, written up with OpenAI.</p>
        </div>
        <nav className="cx-links">
          <Link href={`/paese/${selected.slug}`}>COUNTRY PAGE + SOURCES →</Link>
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
        <span className="r">MONTHLY SNAPSHOT — NOT A LIVE FEED · ↑↓ COUNTRY · 1 2 3 VIEW · + − 0 ZOOM</span>
      </footer>
    </main>
  );
}
