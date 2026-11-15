"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "@/components/Flag";
import Stage, { GROUP_NAME } from "@/components/console/Stage";
import Strip from "@/components/console/Strip";
import Tour, { TOUR_KEY } from "@/components/console/Tour";
import { labelEn } from "@/lib/english";
import CountUp from "@/components/motion/CountUp";
import Roll from "@/components/motion/Roll";
import { fmtClose, fmtEventDate, marketVerdict, money, MONTHS, pct, TYPE_LABEL } from "@/lib/format";

const ymLabel = (s) => { const [y, m] = s.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const VIEWS = [
  { key: "field", n: "1", ask: "Where", name: "Signal field", line: "The chance of a coup attempt in each country over the next six months. Colour, height and pulse all show that one number. Drag to rotate, scroll to zoom." },
  { key: "atlas", n: "2", ask: "When", name: "Temporal atlas", line: "The model's forecast for every country since 1975, quarter by quarter. Height is the probability; the selected country is lit." },
  { key: "trace", n: "3", ask: "Why", name: "Model trace", line: "How each group of variables pushes this country's odds up (amber) or down (cyan) from a reference country. Click a row to see its drivers." },
];
// who the brief is written for: same evidence, different emphasis (see lib/dossier-profile.js)
const LENSES = [["analyst", "Analyst"], ["investor", "Investor or risk manager"], ["policy", "Diplomat or policy analyst"], ["newsroom", "Journalist or researcher"], ["aid", "Humanitarian or development team"]];
const cache = new Map();

export default function Console({ list, meta, auc, featureGroup, registry }) {
  const bySlug = useMemo(() => new Map(list.map((c) => [c.slug, c])), [list]);
  const [slug, setSlug] = useState(list[0]?.slug), [view, setView] = useState("field");
  const [plane, setPlane] = useState(false), [live, setLive] = useState(true), [q, setQ] = useState(""), [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null), [atlas, setAtlas] = useState(null), [ready, setReady] = useState(false);
  const [dossier, setDossier] = useState({ state: "idle" }), [tour, setTour] = useState(false), [lens, setLens] = useState("analyst");
  const filterRef = useRef(null), listRef = useRef(null), stageApi = useRef(null);
  const selected = bySlug.get(slug) || list[0];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (bySlug.has(p.get("c"))) setSlug(p.get("c"));
    if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLive(false);
    try { if (p.get("tour") === "1" || !localStorage.getItem(TOUR_KEY)) setTour(true); } catch { /* storage blocked: skip the tour */ }
    try { const l = localStorage.getItem("toolcoup-lens"); if (LENSES.some((x) => x[0] === l)) setLens(l); } catch { /* storage blocked: default lens */ }
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
  const [markets, setMarkets] = useState(null);
  useEffect(() => { fetch("/api/markets").then((r) => (r.ok ? r.json() : null)).then((d) => setMarkets(d?.primary || {})).catch(() => setMarkets({})); }, []);

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
      const res = await fetch(`/api/dossier/${target}?issue=${issue}&lens=${lens}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      const url = URL.createObjectURL(await res.blob()), a = document.createElement("a");
      a.href = url; a.download = `praevex-brief-${target}-${issue}.pdf`; document.body.appendChild(a); a.click(); a.remove();
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
        <header>
          <h2>Watchlist <em>{shown.length}</em></h2>
          <p>Chance of a coup attempt, {ymLabel(meta.forecast_from)} to {ymLabel(meta.forecast_to)}</p>
          <p className="sub">Issue {registry?.latest || meta.forecast_from} · data through {ymLabel(meta.data_end)}</p>
        </header>
        <input ref={filterRef} className="cx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by country or region" aria-label="Filter countries" aria-keyshortcuts="/" />
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
          {!shown.length && <li className="cx-none">No country matches.</li>}
        </ol>
      </aside>

      <section className="cx-main" aria-label={v.name}>
        <nav className="cx-tabs" aria-label="Views">
          {VIEWS.map((x) => <button key={x.key} className={view === x.key ? "on" : ""} onClick={() => setView(x.key)} aria-pressed={view === x.key} aria-keyshortcuts={x.n} title={`${x.name} (key ${x.n})`}><b>{x.ask}</b><span>{x.name}</span></button>)}
          <span className="cx-tabs-fill" />
          {view === "field" && <button className={plane ? "on" : ""} onClick={() => setPlane(!plane)} aria-pressed={plane} aria-keyshortcuts="g" title="Switch between globe and flat map (key G)">{plane ? "Flat map" : "Globe"}</button>}
          <button className={live ? "on" : ""} onClick={() => setLive(!live)} aria-pressed={live} aria-keyshortcuts="m" title="Turn the animation on or off (key M)">{live ? "Motion on" : "Motion off"}</button>
          <button onClick={() => setTour(true)} aria-keyshortcuts="?" title="Open the guide (key ?)">Guide</button>
        </nav>
        <div className="cx-stage-wrap">
          <Stage view={view} list={list} selected={selected} detail={detail} atlas={atlas} plane={plane} live={live} onSelect={setSlug} focus={focus} onFocus={setFocus} apiRef={stageApi} />
          <p className="cx-caption">{v.line}</p>
          {view !== "trace" && (
            <div className="cx-legend" aria-hidden="true"><span>0</span><i /><span>{pct(view === "field" ? list[0].risk : 0.3, 0)}{view === "field" ? "" : "+"}</span></div>
          )}
        </div>
        <Strip country={selected} detail={detail} />
      </section>

      <aside className="cx-read" aria-label="Selected country">
        <header><h2 className="cx-flagrow"><Flag iso={selected.iso} height={16} />{selected.name}</h2><span>{selected.region}</span></header>
        <div className="cx-p">
          <b><CountUp value={selected.risk} format={(v) => pct(v)} /></b>
          <span>chance of a coup attempt, {ymLabel(meta.forecast_from)} to {ymLabel(meta.forecast_to)}</span>
          {selected.risk_lo != null && (
            <div className="cx-ci" title="80% interval from country-resampled refits">
              <i style={{ left: `${(selected.risk_lo / scaleMax) * 100}%`, width: `${((selected.risk_hi - selected.risk_lo) / scaleMax) * 100}%` }} />
              <u style={{ left: `${(selected.risk / scaleMax) * 100}%` }} />
            </div>
          )}
          {selected.risk_lo != null && <span>80% range {pct(selected.risk_lo)} to {pct(selected.risk_hi)}</span>}
        </div>
        <dl className="cx-kv">
          <div><dt>Rank</dt><dd>{selected.pos} of {list.length}</dd></div>
          <div><dt>Times the base rate</dt><dd>{(selected.risk / meta.base_rate).toFixed(1)}×</dd></div>
          <div><dt>Change in 3 months</dt><dd className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>{delta == null ? "n/a" : `${delta > 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(2)} points`}</dd></div>
          <div><dt>Attempts since 1900</dt><dd>{selected.attempts} <small>({selected.successes} successful)</small></dd></div>
          <div><dt>Last attempt</dt><dd>{selected.last ? <>{fmtEventDate({ date: selected.last.date, prec: "day" })} <small>{TYPE_LABEL[selected.last.type]?.toLowerCase()}</small></> : "none recorded"}</dd></div>
        </dl>
        {markets?.[selected.slug] && (() => {
          const mk = markets[selected.slug], verdict = marketVerdict(mk.p, mk.model), f = (v) => pct(v, v < 0.1 ? 1 : 0);
          return (
            <section className={`cx-market ${verdict?.kind || ""}`} aria-label="Prediction market">
              <header><h3>What the market says <em>{mk.source}</em></h3><Link href={`/paese/${selected.slug}#crowd`}>Compare in detail</Link></header>
              <div className="cx-mk"><b>{f(mk.p)}</b><span>{mk.model != null ? <>on the market; our model gives <b>{f(mk.model)}</b> over the same horizon</> : "on the market"}</span></div>
              <p className="cx-note">“{mk.question}” Closes {fmtClose(mk.closes)}; {money(mk.volume)} traded.{verdict && ` ${verdict.text}`}</p>
            </section>
          );
        })()}
        <section className="cx-drivers">
          <header><h3>Largest drivers {focus && <em>{GROUP_NAME[focus]}</em>}</h3>{focus ? <button onClick={() => setFocus(null)}>Show all</button> : <span>log-odds</span>}</header>
          {!detail && <p className="cx-wait">Loading…</p>}
          {detail && !drivers.length && <p className="cx-note">{focus ? "None of the six largest drivers belongs to this group." : "No driver decomposition exported for this country."}</p>}
          <ul>
            {drivers.map((d) => (
              <li key={d.label} className={d.contrib > 0 ? "up" : "down"}>
                <span>{labelEn(d.label)}</span><b>{d.contrib > 0 ? "+" : ""}{d.contrib.toFixed(2)}</b>
                <i style={{ width: `${(Math.abs(d.contrib) / top) * 100}%` }} />
              </li>
            ))}
          </ul>
          <p className="cx-note">The six largest terms of the logistic component. They are associations found in the data and carry no causal claim.</p>
        </section>
        {detail?.analysis && <section className="cx-country-context">
          <h3>Country context</h3>
          <dl className="cx-kv">
            <div><dt>Rank in its region</dt><dd>{detail.analysis.region.rank} of {detail.analysis.region.count}</dd></div>
            <div><dt>Regional median</dt><dd>{pct(detail.analysis.region.median)}</dd></div>
            <div><dt>Regime</dt><dd>{detail.diagnostics?.regime || "unavailable"}</dd></div>
          </dl>
          <p className="cx-note">The median covers the other countries in the region. Annual regime records can lag current events.</p>
          <details><summary>Activity in the last 3 months</summary><dl className="cx-kv">{detail.analysis.signals.map((s) => <div key={s.key}><dt>{s.label}</dt><dd>{s.recentTotal ?? "—"}<small>{s.ratio != null ? ` / ${s.ratio.toFixed(1)}× baseline` : s.newActivity ? " / after zero baseline" : ""}</small></dd></div>)}</dl><p className="cx-note">Compared with the 24 months before. Counts depend on how well events are reported.</p></details>
          <Link href={`/paese/${selected.slug}#assessment`}>Read the full assessment</Link>
        </section>}
        <nav className="cx-links">
          <Link href={`/paese/${selected.slug}`}>Country page and sources</Link>
          <Link href="/registry">Forecast registry</Link>
          <Link href="/metodo">Method and validation</Link>
        </nav>
        <div className="cx-dossier">
          <label className="cx-lens"><span>Brief for</span>
            <select value={lens} onChange={(e) => { setLens(e.target.value); try { localStorage.setItem("toolcoup-lens", e.target.value); } catch { /* ignore */ } }}>
              {LENSES.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
          <button onClick={downloadDossier} disabled={dossier.state === "busy"}>
            {dossier.state === "busy" ? <>Writing the brief… <small>about 30 s</small></> : <Roll>Download country brief (PDF)</Roll>}
          </button>
          {dossier.state === "error" && dossier.slug === selected.slug && <p role="alert">{dossier.msg}</p>}
          <p>Figures and coup records come from our database, headlines from a fixed list of outlets; the text is drafted with OpenAI.</p>
        </div>
      </aside>

    </main>
  );
}
