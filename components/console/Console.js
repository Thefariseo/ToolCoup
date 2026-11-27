"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Flag from "@/components/Flag";
import Stage, { GROUP_NAME } from "@/components/console/Stage";
import Strip from "@/components/console/Strip";
import Tour, { TOUR_KEY } from "@/components/console/Tour";
import { useMedia } from "@/components/home/Pick";
import { labelEn } from "@/lib/english";
import CountUp from "@/components/motion/CountUp";
import { change, fmtClose, marketVerdict, money, MONTHS, ordinal, pct, points, times, TYPE_LABEL } from "@/lib/format";

const ymLabel = (s) => { const [y, m] = s.split("-"); return `${MONTHS[m - 1]} ${y}`; };
const VIEWS = [
  { key: "field", n: "1", ask: "Where", name: "Signal field", line: "Colour and height: each country's chance of a coup attempt in six months.", hint: "Drag to turn, scroll to zoom" },
  { key: "atlas", n: "2", ask: "When", name: "Temporal atlas", line: "One ridge per country since 1975, quarter by quarter. Taller means a higher chance.", hint: "Scroll to zoom, drag to pan" },
  { key: "trace", n: "3", ask: "Why", name: "Model trace", line: "Amber raises the odds, cyan lowers them. Choose a row to see inside it.", hint: "" },
];
// who the brief is written for: same evidence, different emphasis (see lib/dossier-profile.js)
const LENSES = [["analyst", "Analyst"], ["investor", "Investor or risk manager"], ["policy", "Diplomat or policy analyst"], ["newsroom", "Journalist or researcher"], ["aid", "Humanitarian or development team"]];
const cache = new Map();
const SORTS = [["chance", "Chance"], ["rising", "Rising"], ["name", "A to Z"]];
const TIMELINE_KEY = "toolcoup-timeline";
const ICONS = {
  in: "M8 3.5v9M3.5 8h9", out: "M3.5 8h9", fit: "M3 6V3h3M10 3h3v3M13 10v3h-3M6 13H3v-3",
  map: "M2.5 4.2 6 3l4 1.4L13.5 3v8.8L10 13l-4-1.4-3.5 1.2V4.2ZM6 3v8.6M10 4.4V13",
  globe: "M8 2.2a5.8 5.8 0 1 0 0 11.6 5.8 5.8 0 0 0 0-11.6ZM2.4 8h11.2M8 2.2c3.2 3.1 3.2 8.5 0 11.6M8 2.2c-3.2 3.1-3.2 8.5 0 11.6",
  pause: "M5.5 3.5v9M10.5 3.5v9", play: "M5 3.5 12.5 8 5 12.5Z", timeline: "M2.5 13.5h11M3.5 11V8M6.5 11V4M9.5 11V6.5M12.5 11V9",
  guide: "M6 6.1c.2-1.1 1-1.7 2.1-1.7 1.2 0 2.1.8 2.1 1.8 0 .9-.5 1.3-1.2 1.8-.6.4-1 .8-1 1.5M8 11.6v.2",
};

// one tool of the instrument: an icon that says what it does on hover and focus
function Tool({ icon, name, shortcut, pressed, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={pressed} aria-label={name} aria-keyshortcuts={shortcut} data-tip={shortcut ? `${name} (${shortcut === "?" ? "?" : shortcut.toUpperCase()})` : name}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONS[icon]} /></svg>
    </button>
  );
}

// one watchlist row: memoised, so choosing a country redraws two rows instead of all of them
const Row = memo(function Row({ c, on, top, pick }) {
  const d = change(c), moved = Math.abs(d) >= 0.0005;
  return (
    <li>
      <button className={on ? "on" : ""} onClick={() => pick(c.slug)} aria-current={on}>
        <span className="n">{c.pos}</span><Flag iso={c.iso} height={12} /><span className="name">{c.name}</span>
        <span className={`d ${moved ? (d > 0 ? "up" : "down") : ""}`} title="Change in three months, in points">{points(d)}</span>
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
  const [sort, setSort] = useState("chance"), [timeline, setTimeline] = useState(false), [offer, setOffer] = useState(false);
  const [pane, setPane] = useState("country");               // narrow screens show the country or the watchlist, one at a time
  const filterRef = useRef(null), listRef = useRef(null), stageApi = useRef(null), panesRef = useRef(null);       // panesRef: where the panes sit in the page
  const mainRef = useRef(null), sideRef = useRef(null), readRef = useRef(null), topRef = useRef(null), stripRef = useRef(null);
  const inset = useInsets({ main: mainRef, list: sideRef, read: readRef, top: topRef, strip: stripRef }, [timeline]);
  const roomy = useMedia("(min-width: 1440px)"), wide = useMedia("(min-width: 1100px)");
  const selected = bySlug.get(slug) || list[0];
  // the drawing also keeps clear of the tools (a column beside the panels, a row over a narrow stage), and in "When"
  // of the line of figures under it
  const clear = useMemo(() => (inset.l ? { l: inset.l, r: inset.r + 52, t: inset.t, b: inset.b + (view === "atlas" ? 40 : 0) }
    : { l: 0, r: 0, t: view === "trace" ? 0 : 52, b: 0 }), [inset, view]);                    // the ledger keeps its own head room

  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (bySlug.has(p.get("c"))) setSlug(p.get("c"));
    if (VIEWS.some((v) => v.key === p.get("v"))) setView(p.get("v"));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) setLive(false);
    // the timeline opens where there is height for it (and under the stage on a narrow screen), unless the reader chose
    let kept = null;
    try { kept = localStorage.getItem(TIMELINE_KEY); } catch { /* storage blocked */ }
    setTimeline(kept ? kept === "1" : window.matchMedia("(max-width: 1099px)").matches || window.innerHeight >= 820);
    // a first visit is offered the guide in a corner; it opens by itself only when the address asks for it
    try { if (p.get("tour") === "1") setTour(true); else if (!localStorage.getItem(TOUR_KEY)) setOffer(true); } catch { /* storage blocked: no offer */ }
    try { const l = localStorage.getItem("toolcoup-lens"); if (LENSES.some((x) => x[0] === l)) setLens(l); } catch { /* storage blocked: default lens */ }
    setReady(true);
  }, [bySlug]);
  useEffect(() => { if (ready) window.history.replaceState(null, "", `?c=${slug}&v=${view}`); }, [ready, slug, view]);
  const toggleTimeline = useCallback(() => setTimeline((t) => { try { localStorage.setItem(TIMELINE_KEY, t ? "0" : "1"); } catch { /* ignore */ } return !t; }), []);

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
  // on a narrow screen the answer to a choice may be off screen: bring it into view
  const narrow = () => window.matchMedia("(max-width: 1099px)").matches;
  const fromList = useCallback((s) => {                          // a row of the list answers on the country pane
    setSlug(s);
    if (narrow()) { setPane("country"); requestAnimationFrame(() => panesRef.current?.scrollIntoView({ block: "start" })); }
  }, []);
  const seeWhy = useCallback(() => {                             // the model trace is drawn on the stage, up the page
    setView("trace");
    if (narrow()) window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);
  const fromLedger = useCallback((group) => {                    // a row of the ledger lists its drivers under the stage
    setFocus(group);
    if (group && narrow()) { setPane("country"); requestAnimationFrame(() => readRef.current?.querySelector(".cx-drivers")?.scrollIntoView({ block: "center", behavior: "smooth" })); }
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
      if (e.key === "Escape" && typing) { e.target.blur(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector("dialog[open]")) return;
      if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); step(1); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); step(-1); }
      else if (e.key === "/") { e.preventDefault(); setPane("list"); requestAnimationFrame(() => filterRef.current?.focus()); }
      else if (e.key === "g") setPlane((v) => !v);
      else if (e.key === "+" || e.key === "=") stageApi.current?.zoom(1.4);
      else if (e.key === "-" || e.key === "_") stageApi.current?.zoom(1 / 1.4);
      else if (e.key === "0") stageApi.current?.reset();
      else if (e.key === "m") setLive((v) => !v);
      else if (e.key === "?") setTour(true);
      else if (e.key === "t") toggleTimeline();
      else if (VIEWS.some((v) => v.n === e.key)) setView(VIEWS.find((v) => v.n === e.key).key);
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [step, toggleTimeline]);
  useEffect(() => {                      // keep the selected row in view without scrolling the page itself
    const ol = listRef.current, li = ol?.querySelector(".on")?.parentElement; if (!li) return;
    if (li.offsetTop < ol.scrollTop) ol.scrollTop = li.offsetTop;
    else if (li.offsetTop + li.offsetHeight > ol.scrollTop + ol.clientHeight) ol.scrollTop = li.offsetTop + li.offsetHeight - ol.clientHeight;
  }, [slug, pane]);

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
  const at = (p) => `${Math.min(100, (p / scaleMax) * 100)}%`;
  const closeOffer = () => { setOffer(false); try { localStorage.setItem(TOUR_KEY, "1"); } catch { /* ignore */ } };

  return (
    <main id="top" className="cx" data-pane={pane} data-view={view}>
      <h1 className="sr-only">Coup-risk forecast for {list.length} countries</h1>
      <Tour open={tour} onClose={() => { setTour(false); setOffer(false); }} onView={setView} />
      <aside ref={sideRef} className="cx-list" id="cx-list" aria-label="Watchlist">
        <header>
          <h2>Watchlist <em>{shown.length}</em></h2>
          <p>Chance of a coup attempt by {ymLabel(meta.forecast_to)}</p>
        </header>
        <input ref={filterRef} className="cx-input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by country or region" aria-label="Filter countries" aria-keyshortcuts="/" />
        <div className="cx-sort" role="group" aria-label="Order the list by">
          {SORTS.map(([k, name]) => <button key={k} className={sort === k ? "on" : ""} aria-pressed={sort === k} onClick={() => setSort(k)}>{name}</button>)}
          <span>3 months, pts</span>
        </div>
        <ol ref={listRef}>
          {shown.map((c) => <Row key={c.slug} c={c} on={c.slug === slug} top={list[0].risk} pick={fromList} />)}
          {!shown.length && <li className="cx-none">No country or region matches “{q.trim()}”.</li>}
        </ol>
        <p className="cx-issue">Issue {registry?.latest || meta.forecast_from} · data through {ymLabel(meta.data_end)}</p>
      </aside>

      <div ref={mainRef} className="cx-main" role="region" aria-label={v.name}>
        <div className="cx-stage-wrap">
          <Stage view={view} list={list} selected={selected} detail={detail} atlas={atlas} plane={plane} live={live} onSelect={setSlug} focus={focus} onFocus={fromLedger} apiRef={stageApi}
            inset={clear} fill={wide ? 1.14 : 1.05} labels={roomy ? 9 : wide ? 6 : 5} />
        </div>
        <div ref={topRef} className="cx-top">
          <nav className="cx-tabs" aria-label="Views">
            {VIEWS.map((x) => <button key={x.key} className={view === x.key ? "on" : ""} onClick={() => setView(x.key)} aria-pressed={view === x.key} aria-keyshortcuts={x.n} title={`${x.name} (key ${x.n})`}><b>{x.ask}</b><span>{x.name}</span></button>)}
          </nav>
          <p className="cx-caption">{v.line}</p>
        </div>
        <div className="cx-rail" role="group" aria-label="Stage tools" style={{ right: inset.r + 12, top: inset.t + 8 }}>
          {view !== "trace" && (
            <span>
              <Tool icon="in" name="Zoom in" shortcut="+" onClick={() => stageApi.current?.zoom(1.5)} />
              <Tool icon="out" name="Zoom out" shortcut="-" onClick={() => stageApi.current?.zoom(1 / 1.5)} />
              <Tool icon="fit" name="Reset zoom" shortcut="0" onClick={() => stageApi.current?.reset()} />
            </span>
          )}
          <span>
            {view === "field" && <Tool icon={plane ? "globe" : "map"} name={plane ? "Show the globe" : "Show a flat map"} shortcut="g" pressed={plane} onClick={() => setPlane(!plane)} />}
            <Tool icon={live ? "pause" : "play"} name={live ? "Pause motion" : "Resume motion"} shortcut="m" pressed={!live} onClick={() => setLive(!live)} />
            <Tool icon="timeline" name={timeline ? "Hide the timeline" : "Show the timeline"} shortcut="t" pressed={timeline} onClick={toggleTimeline} />
            <Tool icon="guide" name="Open the guide" shortcut="?" onClick={() => setTour(true)} />
          </span>
        </div>
        <div className="cx-legend" style={{ left: inset.l + 16, top: inset.t + 8 }}>
          {view !== "trace" && <p><span>0</span><i aria-hidden="true" /><span>{pct(view === "field" ? list[0].risk : 0.3, 0)}{view === "field" ? "" : "+"} chance</span></p>}
          {v.hint && <small>{v.hint}</small>}
        </div>
        {offer && !tour && (
          <div className="cx-offer" role="note" style={{ right: inset.r + 16, bottom: inset.b + 12 }}>
            <p><b>First time here?</b> Five short steps show how to read it.</p>
            <div><button className="btn btn--primary" onClick={() => { setOffer(false); setTour(true); }}>Start the guide</button><button className="btn btn--secondary" onClick={closeOffer}>Not now</button></div>
          </div>
        )}
        <span ref={panesRef} className="cx-panes-at" aria-hidden="true" />
        <div className="cx-panes" role="group" aria-label="Show">
          <button type="button" aria-pressed={pane === "country"} onClick={() => setPane("country")}><Flag iso={selected.iso} height={12} /><span>{selected.name}</span><b>{pct(selected.risk)}</b></button>
          <button type="button" aria-pressed={pane === "list"} onClick={() => setPane("list")}>Watchlist <em>{list.length}</em></button>
        </div>
        <div ref={stripRef} className={`cx-dock${timeline ? "" : " closed"}`}>
          {timeline
            ? <Strip country={selected} detail={detail} onClose={toggleTimeline} />
            : <button type="button" className="cx-dock__open" onClick={toggleTimeline}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ICONS.timeline} /></svg>Show {selected.name}&apos;s timeline since 1975</button>}
        </div>
      </div>

      <aside ref={readRef} className="cx-read" aria-label="Selected country">
        <header>
          <div><h2 className="cx-flagrow"><Flag iso={selected.iso} height={18} />{selected.name}</h2><span>{selected.region}</span></div>
          <Link href={`/paese/${selected.slug}`}>Country page</Link>
        </header>
        <div className="cx-p" aria-live="polite">
          <p className="cx-p__big"><b><CountUp value={selected.risk} format={(x) => pct(x)} /></b><span>chance of a coup attempt<br />{ymLabel(meta.forecast_from)} to {ymLabel(meta.forecast_to)}</span></p>
          {selected.risk_lo != null && (
            <>
              <div className="cx-ci" role="img" aria-label={`80% range ${pct(selected.risk_lo)} to ${pct(selected.risk_hi)}; a typical country is at ${pct(meta.base_rate)}`}>
                <s style={{ left: at(meta.base_rate) }} />
                <i style={{ left: at(selected.risk_lo), width: `calc(${at(selected.risk_hi)} - ${at(selected.risk_lo)})` }} />
                <u style={{ left: at(selected.risk) }} />
              </div>
              <p className="cx-ci__key"><span><s />typical {pct(meta.base_rate)}</span><span><i />80% range {pct(selected.risk_lo)} to {pct(selected.risk_hi)}</span></p>
            </>
          )}
        </div>
        <dl className="cx-tiles">
          <div><dt>Rank</dt><dd>{ordinal(selected.pos)}<small> of {list.length}</small></dd></div>
          <div><dt>Typical country</dt><dd>{times(selected.risk / meta.base_rate)}</dd></div>
          <div><dt>3 months</dt><dd className={delta > 0.0005 ? "up" : delta < -0.0005 ? "down" : ""}>{delta == null ? "n/a" : points(delta)}<small> pts</small></dd></div>
        </dl>
        <section className="cx-drivers">
          <header><h3>Largest drivers {focus && <em>{GROUP_NAME[focus]}</em>}</h3>{focus ? <button onClick={() => setFocus(null)}>Show all</button> : <button onClick={seeWhy}>See why</button>}</header>
          {!detail && <p className="cx-wait">Loading…</p>}
          {detail && !drivers.length && <p className="cx-note">{focus ? "None of the six largest drivers belongs to this group." : "No driver decomposition exported for this country."}</p>}
          <ul>
            {drivers.map((d) => (
              <li key={d.label} className={d.contrib > 0 ? "up" : "down"}>
                <span>{labelEn(d.label)}</span><b title="log-odds">{d.contrib > 0 ? "+" : "−"}{Math.abs(d.contrib).toFixed(2)}</b>
                <i style={{ width: `${(Math.abs(d.contrib) / top) * 100}%` }} />
              </li>
            ))}
          </ul>
          <p className="cx-note">Log-odds from the logistic model. Patterns in past data that go with coups, not proven causes.</p>
        </section>
        {markets?.[selected.slug] && (() => {
          const mk = markets[selected.slug], verdict = marketVerdict(mk.p, mk.model), f = (x) => pct(x, x < 0.1 ? 1 : 0);
          return (
            <section className={`cx-market ${verdict?.kind || ""}`} aria-label="Prediction market">
              <header><h3>What the market says <em>{mk.source}</em></h3><Link href={`/paese/${selected.slug}#crowd`}>Compare</Link></header>
              <div className="cx-mk"><b>{f(mk.p)}</b><span>{mk.model != null ? <>on the market; our model gives <b>{f(mk.model)}</b> over the same horizon</> : "on the market"}</span></div>
              <p className="cx-note">“{mk.question}” Closes {fmtClose(mk.closes)}; {money(mk.volume)} traded.{verdict && ` ${verdict.text}`}</p>
            </section>
          );
        })()}
        <dl className="cx-kv">
          <div><dt>Attempts since 1900</dt><dd>{selected.attempts}<small> · {selected.successes} successful</small></dd></div>
          <div><dt>Latest attempt</dt><dd>{selected.last ? <>{selected.last.date.slice(0, 4)}<small> · {TYPE_LABEL[selected.last.type]?.toLowerCase()}</small></> : <small>none recorded</small>}</dd></div>
          {detail?.analysis && <>
            <div><dt>Rank in its region</dt><dd>{detail.analysis.region.rank}<small> of {detail.analysis.region.count}</small></dd></div>
            <div><dt>Regional median</dt><dd>{pct(detail.analysis.region.median)}</dd></div>
            <div><dt>Regime</dt><dd>{detail.diagnostics?.regime || "unavailable"}</dd></div>
          </>}
        </dl>
        {detail?.analysis && <section className="cx-country-context">
          <details><summary>Activity in the last 3 months</summary><dl className="cx-kv">{detail.analysis.signals.map((s) => <div key={s.key}><dt>{s.label}</dt><dd>{s.recentTotal ?? "—"}<small>{s.ratio != null ? ` / ${s.ratio.toFixed(1)}× baseline` : s.newActivity ? " / after zero baseline" : ""}</small></dd></div>)}</dl><p className="cx-note">Compared with the 24 months before. Counts depend on how well events get reported. The median is for the other countries in the region.</p></details>
        </section>}
        <nav className="cx-links">
          <Link href={`/paese/${selected.slug}#assessment`}>Full assessment and sources</Link>
          <Link href="/metodo">Method and validation</Link>
        </nav>
        <div className="cx-dossier">
          <label className="cx-lens"><span>Brief for</span>
            <select className="select" value={lens} onChange={(e) => { setLens(e.target.value); try { localStorage.setItem("toolcoup-lens", e.target.value); } catch { /* ignore */ } }}>
              {LENSES.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
          <button className="btn btn--primary" onClick={downloadDossier} disabled={dossier.state === "busy"} title="A PDF of four pages, written for the reader you pick">
            {dossier.state === "busy" ? <>Writing the brief… <small>about 2 min</small></> : <>Download the brief <small>PDF, about 2 min</small></>}
          </button>
          {dossier.state === "error" && dossier.slug === selected.slug && <p role="alert">{dossier.msg}</p>}
        </div>
      </aside>

    </main>
  );
}
