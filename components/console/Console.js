"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "@/components/Flag";
import Stage, { GROUP_NAME } from "@/components/console/Stage";
import Strip from "@/components/console/Strip";
import Tour, { TOUR_KEY } from "@/components/console/Tour";
import { labelEn } from "@/lib/english";
import CountUp from "@/components/motion/CountUp";
import { fmtClose, marketVerdict, money, MONTHS, pct, TYPE_LABEL } from "@/lib/format";

const ordinal = (n) => `${n}${["th", "st", "nd", "rd"][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10 < 4 ? n % 10 : 0]}`;
const ymLabel = (s) => { const [y, m] = s.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const VIEWS = [
  { key: "field", n: "1", ask: "Where", name: "Signal field", line: "Colour, height and pulse show each country's six-month chance. Drag to turn, scroll to zoom." },
  { key: "atlas", n: "2", ask: "When", name: "Temporal atlas", line: "One ridge per country since 1975, quarter by quarter. Taller means a higher chance; yours is lit." },
  { key: "trace", n: "3", ask: "Why", name: "Model trace", line: "Each group of variables moves the odds up (amber) or down (cyan). Click a row to see inside it." },
];
// who the brief is written for: same evidence, different emphasis (see lib/dossier-profile.js)
const LENSES = [["analyst", "Analyst"], ["investor", "Investor or risk manager"], ["policy", "Diplomat or policy analyst"], ["newsroom", "Journalist or researcher"], ["aid", "Humanitarian or development team"]];
const cache = new Map();
const SORTS = [["chance", "Chance"], ["rising", "Rising"], ["name", "A to Z"]];
const change = (c) => (c.risk_3m_ago == null ? 0 : c.risk - c.risk_3m_ago);
const points = (d) => `${d > 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1)}`;

// one watchlist row: memoised, so choosing a country redraws two rows instead of all of them
const Row = memo(function Row({ c, on, top, pick }) {
  const d = change(c), moved = Math.abs(d) >= 0.0005;
  return (
    <li>
      <button className={on ? "on" : ""} onClick={() => pick(c.slug)} aria-current={on}>
        <span className="n">{c.pos}</span><Flag iso={c.iso} height={12} /><span className="name">{c.name}</span>
        <span className={`d ${moved ? (d > 0 ? "up" : "down") : ""}`} title="Change in three months, in points">{moved ? points(d) : "0.0"}</span>
        <span className="v">{pct(c.risk)}</span>
        <i style={{ width: `${Math.sqrt(c.risk / top) * 100}%` }} />
      </button>
    </li>
  );
});

/** How much of the stage the floating panels cover, in pixels, measured from the panels themselves. */
function useInsets(refs, deps) {
  const [inset, setInset] = useState({ l: 0, r: 0, t: 0, b: 0 });
  useEffect(() => {
    const read = () => {
      const { main, list, read: side, top, strip } = Object.fromEntries(Object.entries(refs).map(([k, r]) => [k, r.current]));
      if (!main || !window.matchMedia("(min-width: 1100px)").matches) { setInset((v) => (v.l || v.r || v.t || v.b ? { l: 0, r: 0, t: 0, b: 0 } : v)); return; }
      const m = main.getBoundingClientRect();
      const next = {
        l: list ? Math.round(list.getBoundingClientRect().right - m.left) : 0,
        r: side ? Math.round(m.right - side.getBoundingClientRect().left) : 0,
        t: top ? Math.round(top.getBoundingClientRect().bottom - m.top) : 0,
        b: strip ? Math.round(m.bottom - strip.getBoundingClientRect().top) : 0,
      };
      setInset((v) => (v.l === next.l && v.r === next.r && v.t === next.t && v.b === next.b ? v : next));
    };
    read();
    const ro = new ResizeObserver(read);
    for (const r of Object.values(refs)) if (r.current) ro.observe(r.current);
    window.addEventListener("resize", read);
    return () => { ro.disconnect(); window.removeEventListener("resize", read); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return inset;
}

export default function Console({ list, meta, auc, featureGroup, registry }) {
  const bySlug = useMemo(() => new Map(list.map((c) => [c.slug, c])), [list]);
  const [slug, setSlug] = useState(list[0]?.slug), [view, setView] = useState("field");
  const [plane, setPlane] = useState(false), [live, setLive] = useState(true), [q, setQ] = useState(""), [focus, setFocus] = useState(null);
  const [detail, setDetail] = useState(null), [atlas, setAtlas] = useState(null), [ready, setReady] = useState(false);
  const [dossier, setDossier] = useState({ state: "idle" }), [tour, setTour] = useState(false), [lens, setLens] = useState("analyst");
  const [sort, setSort] = useState("chance"), [timeline, setTimeline] = useState(true), [offer, setOffer] = useState(false);
  const filterRef = useRef(null), listRef = useRef(null), stageApi = useRef(null);
  const mainRef = useRef(null), sideRef = useRef(null), readRef = useRef(null), topRef = useRef(null), stripRef = useRef(null);
  const inset = useInsets({ main: mainRef, list: sideRef, read: readRef, top: topRef, strip: stripRef }, [timeline]);
  const selected = bySlug.get(slug) || list[0];

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (bySlug.has(p.get("c"))) setSlug(p.get("c"));
    if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLive(false);
    // a first visit is offered the guide in a corner; it opens by itself only when the address asks for it
    try { if (p.get("tour") === "1") setTour(true); else if (!localStorage.getItem(TOUR_KEY)) setOffer(true); } catch { /* storage blocked: no offer */ }
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

  const shown = useMemo(() => {
    const n = q.trim().toLowerCase(), found = n ? list.filter((c) => c.name.toLowerCase().includes(n) || c.region.toLowerCase().includes(n)) : list;
    return sort === "chance" ? found : [...found].sort(sort === "name" ? (a, b) => a.name.localeCompare(b.name) : (a, b) => change(b) - change(a));
  }, [list, q, sort]);
  const step = useCallback((k) => {
    const i = shown.findIndex((c) => c.slug === slug), next = shown[Math.max(0, Math.min(shown.length - 1, (i < 0 ? 0 : i) + k))];
    if (next) setSlug(next.slug);
  }, [shown, slug]);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Escape" && typing) { e.target.blur(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
      else if (e.key === "/") { e.preventDefault(); filterRef.current?.focus(); }
      else if (e.key === "g") setPlane((v) => !v);
      else if (e.key === "+" || e.key === "=") stageApi.current?.zoom(1.4);
      else if (e.key === "-" || e.key === "_") stageApi.current?.zoom(1 / 1.4);
      else if (e.key === "0") stageApi.current?.reset();
      else if (e.key === "m") setLive((v) => !v);
      else if (e.key === "?") setTour(true);
      else if (e.key === "t") setTimeline((v) => !v);
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
  const ratio = selected.risk / meta.base_rate;
  const closeOffer = () => { setOffer(false); try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ } };

  return (
    <main id="top" className="cx">
      <h1 className="sr-only">Coup-risk forecast for {list.length} countries</h1>
      <Tour open={tour} onClose={() => { setTour(false); setOffer(false); }} onView={setView} />
      <aside ref={sideRef} className="cx-list" aria-label="Watchlist">
        <header>
          <h2>Watchlist <em>{shown.length}</em></h2>
          <p>Chance of a coup attempt, {ymLabel(meta.forecast_from)} to {ymLabel(meta.forecast_to)}</p>
        </header>
        <input ref={filterRef} className="cx-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by country or region" aria-label="Filter countries" aria-keyshortcuts="/" />
        <div className="cx-sort" role="group" aria-label="Order the list by">
          {SORTS.map(([k, name]) => <button key={k} className={sort === k ? "on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{name}</button>)}
          <span>3-month change, pts</span>
        </div>
        <ol ref={listRef}>
          {shown.map((c) => <Row key={c.slug} c={c} on={c.slug === slug} top={list[0].risk} pick={setSlug} />)}
          {!shown.length && <li className="cx-none">No country matches.</li>}
        </ol>
        <p className="cx-issue">Issue {registry?.latest || meta.forecast_from} · data through {ymLabel(meta.data_end)}</p>
      </aside>

      <div ref={mainRef} className="cx-main" role="region" aria-label={v.name}>
        <div className="cx-stage-wrap">
          <Stage view={view} list={list} selected={selected} detail={detail} atlas={atlas} plane={plane} live={live} onSelect={setSlug} focus={focus} onFocus={setFocus} apiRef={stageApi}
            inset={inset} fill={inset.l ? 1.18 : 1} />
        </div>
        <div ref={topRef} className="cx-top">
          <div className="cx-bar">
            <nav className="cx-tabs" aria-label="Views">
              {VIEWS.map((x) => <button key={x.key} className={view === x.key ? "on" : ""} onClick={() => setView(x.key)} aria-pressed={view === x.key} aria-keyshortcuts={x.n} title={`${x.name} (key ${x.n})`}><b>{x.ask}</b><span>{x.name}</span></button>)}
            </nav>
            <div className="cx-tools">
              {view === "field" && <button onClick={() => setPlane(!plane)} aria-pressed={plane} aria-keyshortcuts="g" title="Switch between globe and flat map (key G)">{plane ? "Globe" : "Flat map"}</button>}
              <button onClick={() => setLive(!live)} aria-pressed={!live} aria-keyshortcuts="m" title="Pause or resume the animation (key M)">{live ? "Pause motion" : "Resume motion"}</button>
              <button onClick={() => setTimeline((t) => !t)} aria-pressed={timeline} aria-keyshortcuts="t" title="Show or hide the timeline (key T)">Timeline</button>
              <button onClick={() => setTour(true)} aria-keyshortcuts="?" title="Open the guide (key ?)">Guide</button>
            </div>
          </div>
          <p className="cx-caption">{v.line}</p>
        </div>
        {view !== "trace" && (
          <div className="cx-legend" aria-hidden="true" style={{ left: inset.l + 16, bottom: inset.b + 12 }}><span>0</span><i /><span>{pct(view === "field" ? list[0].risk : 0.3, 0)}{view === "field" ? "" : "+"}</span></div>
        )}
        {offer && !tour && (
          <div className="cx-offer" role="note" style={{ right: inset.r + 16, bottom: inset.b + 12 }}>
            <p><b>First time here?</b> Five short steps show how to read it.</p>
            <div><button className="btn btn--primary" onClick={() => { setOffer(false); setTour(true); }}>Start the guide</button><button className="btn btn--secondary" onClick={closeOffer}>Not now</button></div>
          </div>
        )}
        <div ref={stripRef} className={`cx-dock${timeline ? "" : " closed"}`}>
          {timeline && <Strip country={selected} detail={detail} />}
        </div>
      </div>

      <aside ref={readRef} className="cx-read" aria-label="Selected country">
        <header>
          <div><h2 className="cx-flagrow"><Flag iso={selected.iso} height={20} />{selected.name}</h2><span>{selected.region}</span></div>
          <Link href={`/paese/${selected.slug}`}>Country page</Link>
        </header>
        <div className="cx-p" aria-live="polite">
          <b><CountUp value={selected.risk} format={(v) => pct(v)} /></b>
          <strong>{ratio >= 1 ? `${ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}× a typical country` : "below a typical country"}, {ordinal(selected.pos)} of {list.length}</strong>
          <span>chance of a coup attempt, {ymLabel(meta.forecast_from)} to {ymLabel(meta.forecast_to)}</span>
          {selected.risk_lo != null && (
            <div className="cx-ci" title="80% interval from country-resampled refits">
              <i style={{ left: `${(selected.risk_lo / scaleMax) * 100}%`, width: `${((selected.risk_hi - selected.risk_lo) / scaleMax) * 100}%` }} />
              <u style={{ left: `${(selected.risk / scaleMax) * 100}%` }} />
            </div>
          )}
          {selected.risk_lo != null && <span>80% range {pct(selected.risk_lo)} to {pct(selected.risk_hi)}</span>}
        </div>
        <dl className="cx-tiles">
          <div><dt>3-month change</dt><dd className={delta > 0 ? "up" : delta < 0 ? "down" : ""}>{delta == null ? "n/a" : points(delta)}<small> pts</small></dd></div>
          <div><dt>Attempts since 1900</dt><dd>{selected.attempts}<small> {selected.successes} won</small></dd></div>
          <div><dt>Last attempt</dt><dd>{selected.last ? <>{selected.last.date.slice(0, 4)}<small> {TYPE_LABEL[selected.last.type]?.toLowerCase()}</small></> : <small>none recorded</small>}</dd></div>
        </dl>
        {markets?.[selected.slug] && (() => {
          const mk = markets[selected.slug], verdict = marketVerdict(mk.p, mk.model), f = (v) => pct(v, v < 0.1 ? 1 : 0);
          return (
            <section className={`cx-market ${verdict?.kind || ""}`} aria-label="Prediction market">
              <header><h3>What the market says <em>{mk.source}</em></h3><Link href={`/paese/${selected.slug}#crowd`}>Compare</Link></header>
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
          <p className="cx-note">The six largest terms of the logistic model. They are patterns in past data that go with coups; they do not prove a cause.</p>
        </section>
        {detail?.analysis && <section className="cx-country-context">
          <h3>Country context</h3>
          <dl className="cx-kv">
            <div><dt>Rank in its region</dt><dd>{detail.analysis.region.rank} of {detail.analysis.region.count}</dd></div>
            <div><dt>Regional median</dt><dd>{pct(detail.analysis.region.median)}</dd></div>
            <div><dt>Regime</dt><dd>{detail.diagnostics?.regime || "unavailable"}</dd></div>
          </dl>
          <p className="cx-note">The median is for the other countries in the region. Regime records come out once a year, so they can lag.</p>
          <details><summary>Activity in the last 3 months</summary><dl className="cx-kv">{detail.analysis.signals.map((s) => <div key={s.key}><dt>{s.label}</dt><dd>{s.recentTotal ?? "—"}<small>{s.ratio != null ? ` / ${s.ratio.toFixed(1)}× baseline` : s.newActivity ? " / after zero baseline" : ""}</small></dd></div>)}</dl><p className="cx-note">Compared with the 24 months before. Counts depend on how well events get reported.</p></details>
          <Link href={`/paese/${selected.slug}#assessment`}>Read the full assessment</Link>
        </section>}
        <nav className="cx-links">
          <Link href={`/paese/${selected.slug}`}>Country page and sources</Link>
          <Link href="/metodo">Method and validation</Link>
        </nav>
        <div className="cx-dossier">
          <label className="cx-lens"><span>Brief for</span>
            <select className="select" value={lens} onChange={(e) => { setLens(e.target.value); try { localStorage.setItem("toolcoup-lens", e.target.value); } catch { /* ignore */ } }}>
              {LENSES.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
          <button className="btn btn--primary" onClick={downloadDossier} disabled={dossier.state === "busy"}>
            {dossier.state === "busy" ? <>Writing the brief… <small>about 2 min</small></> : "Download the country brief"}
          </button>
          {dossier.state === "error" && dossier.slug === selected.slug && <p role="alert">{dossier.msg}</p>}
          <p>A PDF of four pages, written for the reader you pick. It takes about two minutes.</p>
        </div>
      </aside>

    </main>
  );
}
