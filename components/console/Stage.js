"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ATLAS_GEOM, TRACE_GEOM, atlasHeight, createEngine, riskNorm } from "@/components/console/engine";
import { pct } from "@/lib/format";

const RAD = Math.PI / 180;
export const GROUP_ORDER = ["storia", "contagio", "regime", "leader", "economia", "piazza", "acled"];
export const GROUP_NAME = { storia: "COUP HISTORY", contagio: "CONTAGION", regime: "REGIME", leader: "LEADER / ELECTIONS", economia: "ECONOMY", piazza: "MOBILIZATION", acled: "ACLED MONTHLY" };
const REGION_SHORT = { "Western Africa": "W AFRICA", "Middle Africa": "M AFRICA", "Eastern Africa": "E AFRICA", "Southern Africa": "S AFRICA",
  "Northern Africa": "N AFRICA", "Middle East": "MIDEAST", "Caucasus and Central Asia": "C ASIA", "South Asia": "S ASIA",
  "Southeast Asia": "SE ASIA", "East Asia": "E ASIA", Europe: "EUROPE", "South America": "S AMERICA", "Central America": "C AMERICA",
  Caribbean: "CARIB", "North America": "N AMERICA", Oceania: "OCEANIA" };
const nodeY = (i) => 0.66 - (1.32 * i) / (GROUP_ORDER.length - 1);
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const GROUP_SCALE = 1.8; // log-odds at which a stream reaches full width

let landPromise;
const loadLand = () => (landPromise ||= Promise.all([
  fetch("/geo/land.json").then((r) => r.json()),
  fetch("/geo/land.bin").then((r) => r.arrayBuffer()),
]).then(([meta, bin]) => ({ meta, dots: new Int16Array(bin) })));

const cellKey = (lon, lat, step, dr = 0, dc = 0) => {
  const row = Math.floor((lat + 90) / step) + dr, n = Math.max(1, Math.round((360 / step) * Math.cos((-90 + (row + 0.5) * step) * RAD)));
  return row * 4096 + ((Math.floor(((lon + 180) / 360) * n) + dc + n) % n);
};

export default function Stage({ view, list, selected, detail, atlas, plane, live, onSelect, focus, onFocus, apiRef }) {
  const canvasRef = useRef(null), engineRef = useRef(null), labelRefs = useRef(new Map()), overlayRef = useRef(null);
  const [land, setLand] = useState(null), [failed, setFailed] = useState(false), [tip, setTip] = useState(null);
  const [atlasHover, setAtlasHover] = useState(null), [zoomShown, setZoomShown] = useState(1), [noSim, setNoSim] = useState(false);
  const maxRisk = list[0]?.risk || 0.05;

  useEffect(() => {
    let engine;
    try { engine = createEngine(canvasRef.current); } catch (e) { console.error(e.message); }
    if (!engine) { setFailed(true); return; }
    engineRef.current = engine;
    setNoSim(!engine.state.sim);
    if (apiRef) apiRef.current = { zoom: (f) => engine.zoomAt(0.5, 0.5, f), reset: () => engine.resetCam() };
    loadLand().then(setLand).catch(() => setFailed(true));
    const el = canvasRef.current;
    const wheel = (e) => {                     // native listener: React's onWheel is passive and cannot stop page scroll
      e.preventDefault();
      const r = el.getBoundingClientRect();
      engine.zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { el.removeEventListener("wheel", wheel); engine.destroy(); engineRef.current = null; if (apiRef) apiRef.current = null; };
  }, [apiRef]);

  // ---- FIELD: land dots carry their country's forecast; plumes and pulses scale with it
  const geo = useMemo(() => {
    if (!land) return null;
    const byIso = new Map(list.map((c) => [c.iso, c])), byName = new Map(list.map((c) => [c.name, c]));
    const entry = land.meta.countries.map((g) => (g.iso && byIso.get(g.iso)) || byName.get(g.name) || null);
    const idxOf = new Map(); entry.forEach((c, i) => c && !idxOf.has(c.slug) && idxOf.set(c.slug, i));
    const cells = new Map(), d = land.dots;
    for (let i = 0; i < d.length; i += 3) { const k = cellKey(d[i] / 100, d[i + 1] / 100, land.meta.step); if (!cells.has(k)) cells.set(k, d[i + 2]); }
    return { entry, idxOf, cells };
  }, [land, list]);

  useEffect(() => {
    const engine = engineRef.current; if (!engine || !geo) return;
    const out = [], d = land.dots, r = rnd(7);
    for (let i = 0; i < d.length; i += 3) {
      const c = geo.entry[d[i + 2]], rn = c ? riskNorm(c.risk, maxRisk) : -1, lon = (d[i] / 100) * RAD, lat = (d[i + 1] / 100) * RAD;
      out.push(lon, lat, rn, 0, r(), d[i + 2]);
      if (rn > 0.3) for (let k = Math.round(rn * rn * 10); k > 0; k--) out.push(lon + (r() - 0.5) * 0.012, lat + (r() - 0.5) * 0.012, rn, 0.02 + r() * 0.98, r(), d[i + 2]);
    }
    for (let lat = -60; lat <= 80; lat += 20) for (let lon = -180; lon < 180; lon += 1.5) out.push(lon * RAD, lat * RAD, -2, 0, r(), -9);
    for (let lon = -180; lon < 180; lon += 30) for (let lat = -80; lat <= 80; lat += 1.5) out.push(lon * RAD, lat * RAD, -2, 0, r(), -9);
    const emit = [];
    for (const c of list.slice(0, 8)) {
      const g = land.meta.countries[geo.idxOf.get(c.slug)]; if (!g) continue;
      const lo = g.c[0] * RAD, la = g.c[1] * RAD;
      emit.push(Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo), riskNorm(c.risk, maxRisk));
    }
    engine.setField(new Float32Array(out), emit);
  }, [geo, land, list, maxRisk]);

  useEffect(() => {
    const engine = engineRef.current; if (!engine || !geo || !selected) return;
    const idx = geo.idxOf.get(selected.slug), g = idx != null ? land.meta.countries[idx] : null;
    engine.select(idx ?? -1, g?.c[0], g?.c[1]);
  }, [geo, land, selected]);

  // ---- TRACE: one lane per variable group; lane width and particle share follow |log-odds contribution|
  const groups = useMemo(() => {
    const by = new Map((detail?.groups || []).map((g) => [g.key, g.contrib]));
    return GROUP_ORDER.map((key, i) => ({ key, y: nodeY(i), contrib: by.get(key) ?? 0 }));
  }, [detail]);
  useEffect(() => {
    const engine = engineRef.current; if (!engine || !selected) return;
    engine.setTrace(groups.map((g) => ({ y: g.y, k: detail ? Math.min(1, Math.abs(g.contrib) / GROUP_SCALE) : 0, sign: g.contrib >= 0 ? 1 : -1 })),
      Math.max(0, riskNorm(selected.risk, maxRisk)));
  }, [groups, detail, selected, maxRisk]);
  useEffect(() => { engineRef.current?.focus(focus ? groups.find((g) => g.key === focus)?.y : null); }, [focus, groups]);

  // ---- ATLAS: every country's forecast history as a ridge; regions are separated by a gap
  const ridge = useMemo(() => {
    if (!atlas) return null;
    const pos = []; let p = 0, prev = null; const regions = [];
    atlas.rows.forEach((row, i) => { if (row.region !== prev) { if (prev) p += 4; regions.push({ name: row.region, i }); prev = row.region; } pos.push(p++); });
    const span = Math.max(1, p - 1);
    return { pos: pos.map((v) => v / span), regions, index: new Map(atlas.rows.map((r, i) => [r.slug, i])) };
  }, [atlas]);
  useEffect(() => {
    const engine = engineRef.current; if (!engine || !ridge) return;
    const Q = atlas.quarters, out = new Float32Array(atlas.rows.length * Q * 12); let o = 0;
    atlas.rows.forEach((row, i) => {
      const h = row.v.map((v) => (v < 0 ? 0 : atlasHeight(v / 10000)));
      for (let q = 0; q < Q; q++) for (const side of [0, 1]) { out[o++] = q / (Q - 1); out[o++] = h[q]; out[o++] = ridge.pos[i]; out[o++] = side; }
      for (let q = 0; q < Q; q++) { out[o++] = q / (Q - 1); out[o++] = h[q]; out[o++] = ridge.pos[i]; out[o++] = 1; }
    });
    engine.setAtlas(out, atlas.rows.length, Q);
  }, [atlas, ridge]);
  useEffect(() => {
    engineRef.current?.rows(ridge?.index.get(selected?.slug) ?? -1, atlasHover?.row ?? -1, atlasHover ? atlasHover.q / (atlas.quarters - 1) : -1);
  }, [ridge, selected, atlasHover, atlas]);

  const selRow = ridge?.index.get(selected?.slug);
  // the selected country's trajectory: peak, present value, recorded coups placed on its own ridge
  const traj = useMemo(() => {
    if (!atlas || !ridge || selRow == null) return null;
    const row = atlas.rows[selRow], Q = atlas.quarters, rp = ridge.pos[selRow];
    const at = (q) => ({ cx: ATLAS_GEOM.x(q / (Q - 1), rp), cy: ATLAS_GEOM.yb(rp) + (row.v[q] < 0 ? 0 : atlasHeight(row.v[q] / 10000)) * ATLAS_GEOM.amp });
    let peak = -1, pq = 0, last = -1, lq = 0; const vals = [];
    row.v.forEach((v, q) => { if (v >= 0) { vals.push(v); if (v > peak) { peak = v; pq = q; } last = v; lq = q; } });
    vals.sort((a, b) => a - b);
    const coups = detail?.slug === selected.slug
      ? (detail.coups || []).filter((e) => e.type !== "complotto" && e.conf !== "D" && !e.dup && e.prec !== "year")
        .map((e) => ({ ...e, q: (+e.date.slice(0, 4) - atlas.start) * 4 + Math.floor((+e.date.slice(5, 7) - 1) / 3) }))
        .filter((e) => e.q >= 0 && e.q < Q).map((e) => ({ ...e, ...at(e.q) })) : [];
    return { start: { cx: ATLAS_GEOM.x(0, rp), cy: ATLAS_GEOM.yb(rp) }, end: { cx: ATLAS_GEOM.x(1, rp), cy: ATLAS_GEOM.yb(rp) },
      peak: { v: peak, q: pq, ...at(pq) }, now: { v: last, q: lq, ...at(lq) }, median: vals[Math.floor(vals.length / 2)] ?? 0, coups };
  }, [atlas, ridge, selRow, detail, selected]);

  useEffect(() => { engineRef.current?.setView(view); setTip(null); setAtlasHover(null); }, [view]);
  useEffect(() => { engineRef.current?.setPlane(plane); }, [plane]);
  useEffect(() => { engineRef.current?.setLive(live); }, [live]);

  // ---- overlay placement, once per frame: globe labels follow the sphere, the rest follow the camera
  const beacons = useMemo(() => {
    if (!geo) return [];
    const top = list.slice(0, 10), all = selected && !top.some((c) => c.slug === selected.slug) ? [...top, selected] : top;
    return all.map((c) => ({ c, g: land.meta.countries[geo.idxOf.get(c.slug)] })).filter((b) => b.g);
  }, [geo, land, list, selected]);
  useEffect(() => {
    const engine = engineRef.current; if (!engine) return;
    let last = 1;
    engine.state.onFrame = () => {
      const zl = engine.zoomLevel();
      if (Math.abs(zl - last) > 0.04) { last = zl; setZoomShown(zl); }
      const root = overlayRef.current; if (!root) return;
      const W = root.clientWidth, H = root.clientHeight;
      if (engine.state.view === "field") {
        const placed = [];
        for (const b of beacons) {
          const el = labelRefs.current.get(b.c.slug); if (!el) continue;
          const p = engine.project(b.g.c[0], b.g.c[1]);
          const x = p.x * W, w = el.offsetWidth; let y = p.y * H;
          if (p.front) {                                  // stack labels that would collide; the marker stays on the country
            for (let k = 0; k < 8 && placed.some((q) => x < q.x + q.w + 6 && q.x < x + w + 6 && Math.abs(q.y - y) < 13); k++) y += 13;
            placed.push({ x, y, w });
          }
          el.style.transform = `translate(${x.toFixed(1)}px, ${(p.y * H).toFixed(1)}px)`;
          el.style.setProperty("--dy", `${(y - p.y * H).toFixed(1)}px`);
          el.style.opacity = p.front && p.x > -0.05 && p.x < 1.05 && p.y > -0.05 && p.y < 1.05 ? 1 : 0;
          el.style.pointerEvents = p.front ? "auto" : "none";
        }
        return;
      }
      for (const el of root.querySelectorAll("[data-cx]")) {
        const a = engine.toStage(+el.dataset.cx, +el.dataset.cy);
        el.style.left = `${(a.x * W).toFixed(1)}px`; el.style.top = `${(a.y * H).toFixed(1)}px`;
        if (el.dataset.cx2) el.style.width = `${Math.max(0, (engine.toStage(+el.dataset.cx2, 0).x - a.x) * W).toFixed(1)}px`;
        el.style.opacity = a.x > -0.02 && a.x < 1.02 && a.y > -0.02 && a.y < 1.02 ? "" : 0;
      }
    };
    return () => { if (engine.state) engine.state.onFrame = null; };
  }, [beacons, view]);

  // ---- pointer: rotate / pan / pinch / inspect / select
  const pts = useRef(new Map()), ptr = useRef({ down: false, moved: 0, x: 0, y: 0 }), pinch = useRef(0);
  const pick = (fx, fy) => {
    const engine = engineRef.current; if (!engine || !geo) return null;
    const ll = engine.unproject(fx, fy); if (!ll) return null;
    for (const [dr, dc] of [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
      const idx = geo.cells.get(cellKey(ll[0], ll[1], land.meta.step, dr, dc));
      if (idx != null && geo.entry[idx]) return { idx, c: geo.entry[idx] };
    }
    return null;
  };
  const pickRow = (fx, fy) => {
    const engine = engineRef.current; if (!ridge || !engine) return null;
    const [x, y] = engine.fromStage(fx, fy), tol = 0.012 / engine.zoomLevel(); let best = -1, gap = 1e9;
    ridge.pos.forEach((p, i) => { const d = y - ATLAS_GEOM.yb(p); if (d >= -tol && d < gap) { gap = d; best = i; } });
    if (best < 0 || gap > 0.2 / engine.zoomLevel()) return null;
    const t = (x - ATLAS_GEOM.x(0, ridge.pos[best])) / (ATLAS_GEOM.x(1, ridge.pos[best]) - ATLAS_GEOM.x(0, ridge.pos[best]));
    if (t < 0 || t > 1) return null;
    return { row: best, q: Math.round(t * (atlas.quarters - 1)) };
  };
  const onMove = (e) => {
    const engine = engineRef.current; if (!engine) return;
    const r = e.currentTarget.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height, p = ptr.current;
    if (pts.current.has(e.pointerId)) pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.current.size === 2) {                                    // pinch
      const [a, b] = [...pts.current.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) engine.zoomAt(((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height, d / pinch.current);
      pinch.current = d; p.moved = 99; setTip(null); return;
    }
    if (p.down) {
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (view === "field" && !plane) engine.drag(dx / r.height, dy / r.height); else engine.pan(dx / r.width, dy / r.height);
      p.moved += Math.abs(dx) + Math.abs(dy); p.x = e.clientX; p.y = e.clientY; setTip(null); return;
    }
    if (view === "field") {
      const hit = pick(fx, fy);
      engine.hover(hit ? hit.idx : -1);
      setTip(hit ? { x: e.clientX - r.left, y: e.clientY - r.top, c: hit.c } : null);
    } else if (view === "atlas") {
      const hit = pickRow(fx, fy);
      setAtlasHover(hit);
      setTip(hit ? { x: e.clientX - r.left, y: e.clientY - r.top, row: atlas.rows[hit.row], q: hit.q } : null);
    }
  };
  const onDown = (e) => {
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    ptr.current = { down: true, moved: pts.current.size > 1 ? 99 : 0, x: e.clientX, y: e.clientY };
    pinch.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId); engineRef.current?.dragging(true);
  };
  const onUp = (e) => {
    pts.current.delete(e.pointerId); pinch.current = 0;
    const p = ptr.current; if (pts.current.size) return;
    p.down = false; engineRef.current?.dragging(false);
    if (p.moved > 5) return;
    const r = e.currentTarget.getBoundingClientRect(), fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    if (view === "field") { const hit = pick(fx, fy); if (hit) onSelect(hit.c.slug); }
    if (view === "atlas") { const hit = pickRow(fx, fy); if (hit) onSelect(atlas.rows[hit.row].slug); }
  };
  const onLeave = () => { setTip(null); setAtlasHover(null); engineRef.current?.hover(-1); };

  const quarterLabel = (q) => `${atlas.start + Math.floor(q / 4)} Q${(q % 4) + 1}`;
  const zoomBtn = (f) => engineRef.current?.zoomAt(0.5, 0.5, f);

  return (
    <div className={`cx-stage v-${view}`}>
      <canvas ref={canvasRef} className={view === "field" && !plane ? "grab" : "pan"} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp}
        onPointerCancel={onUp} onPointerLeave={onLeave} aria-hidden="true" />
      {failed && <p className="cx-fail">WebGL2 is unavailable in this browser. The watchlist, readout and timeline remain fully usable.</p>}
      {noSim && view === "trace" && <p className="cx-fail">Float render targets are unavailable: the particle flow cannot run in this browser.</p>}

      <div className="cx-zoom" role="group" aria-label="Zoom">
        <button onClick={() => zoomBtn(1.5)} aria-label="Zoom in">+</button>
        <button onClick={() => zoomBtn(1 / 1.5)} aria-label="Zoom out">−</button>
        <button onClick={() => engineRef.current?.resetCam()} className="fit" aria-label="Reset zoom" title="Reset zoom [0]">{zoomShown.toFixed(1)}×</button>
      </div>

      <div ref={overlayRef} className={`cx-overlay${zoomShown > 2.2 ? " zin" : ""}`}>
        {view === "field" && beacons.map(({ c }) => (
          <button key={c.slug} ref={(el) => { if (el) labelRefs.current.set(c.slug, el); else labelRefs.current.delete(c.slug); }}
            className={`cx-beacon${c.slug === selected?.slug ? " on" : ""}`} onClick={() => onSelect(c.slug)}>
            <i /><span>{String(c.pos).padStart(2, "0")} {c.name.toUpperCase()}</span><b>{pct(c.risk)}</b>
          </button>
        ))}

        {view === "atlas" && ridge && ridge.regions.map((g) => (
          <span key={g.name} className="cx-region" data-cx={ATLAS_GEOM.x(1, ridge.pos[g.i]) + 0.02} data-cy={ATLAS_GEOM.yb(ridge.pos[g.i])}>{REGION_SHORT[g.name] || g.name.toUpperCase()}</span>
        ))}
        {view === "atlas" && atlas && Array.from({ length: 6 }, (_, k) => 1980 + k * 10).map((y) => {
          const t = ((y - atlas.start) * 4) / (atlas.quarters - 1); if (t > 1) return null;
          return <span key={y} className="cx-tick" data-cx={ATLAS_GEOM.x(t, 1)} data-cy={ATLAS_GEOM.yb(1) - 0.03}>{y}</span>;
        })}
        {view === "atlas" && traj && (
          <>
            <span className="cx-guide" data-cx={traj.start.cx} data-cx2={traj.end.cx} data-cy={traj.start.cy} />
            <span className="cx-rowtag" data-cx={traj.start.cx - 0.01} data-cy={traj.start.cy}>{selected.name.toUpperCase()} ▸</span>
            {traj.coups.map((e) => (
              <span key={e.id} className={`cx-mark ${e.type === "riuscito" ? "ok" : "ko"}`} data-cx={e.cx} data-cy={e.cy}><i />{<small>{e.date.slice(0, 4)}</small>}</span>
            ))}
            <span className="cx-peak" data-cx={traj.peak.cx} data-cy={traj.peak.cy}>PEAK {pct(traj.peak.v / 10000)} · {quarterLabel(traj.peak.q)}</span>
            <span className="cx-now" data-cx={traj.now.cx} data-cy={traj.now.cy}><i />NOW {pct(traj.now.v / 10000)}</span>
          </>
        )}
        {view === "atlas" && !atlas && <p className="cx-wait">LOADING 51 YEARS OF FORECASTS<i>_</i></p>}

        {view === "trace" && groups.map((g) => (
          <button key={g.key} className={`cx-node${g.contrib > 0 ? " up" : g.contrib < 0 ? " down" : ""}${focus === g.key ? " on" : ""}`}
            data-cx={TRACE_GEOM.nodeX - 0.02} data-cy={g.y} onClick={() => onFocus(focus === g.key ? null : g.key)} disabled={!detail}>
            <span>{GROUP_NAME[g.key]}</span><b>{detail ? `${g.contrib > 0 ? "+" : ""}${g.contrib.toFixed(2)}` : "…"}</b>
          </button>
        ))}
        {view === "trace" && (
          <div className="cx-core" data-cx={TRACE_GEOM.core[0]} data-cy={TRACE_GEOM.core[1]}>
            <b>{pct(selected?.risk)}</b><span>P(ATTEMPT) · 6 MO</span>
          </div>
        )}
      </div>

      {view === "atlas" && traj && (
        <div className="cx-traj">
          <b>{selected.name.toUpperCase()} · TRAJECTORY SINCE {atlas.start}</b>
          <span>PEAK <em>{pct(traj.peak.v / 10000)}</em> {quarterLabel(traj.peak.q)}</span>
          <span>NOW <em>{pct(traj.now.v / 10000)}</em> {quarterLabel(traj.now.q)}</span>
          <span>MEDIAN <em>{pct(traj.median / 10000)}</em></span>
          <span><i className="d" /> {traj.coups.length} recorded attempts (A–C)</span>
        </div>
      )}

      {tip && (
        <div className="cx-tip" style={{ left: Math.min(tip.x + 14, (canvasRef.current?.clientWidth || 400) - 190), top: tip.y + 14 }}>
          {tip.c ? (<><b>{tip.c.name}</b><span>{pct(tip.c.risk, 2)} · rank {tip.c.pos}</span><em>{tip.c.region}</em></>)
            : (<><b>{tip.row.name}</b><span>{quarterLabel(tip.q)} · {tip.row.v[tip.q] < 0 ? "no forecast" : pct(tip.row.v[tip.q] / 10000, 2)}</span><em>click to open</em></>)}
        </div>
      )}
    </div>
  );
}
