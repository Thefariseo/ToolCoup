"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ATLAS_GEOM, atlasHeight, createEngine, riskNorm } from "@/components/console/engine";
import { GROUP_ORDER, layoutLedger, ledgerModel } from "@/components/console/ledger";
import TraceLedger from "@/components/console/TraceLedger";
import { pct } from "@/lib/format";

const RAD = Math.PI / 180;
export const GROUP_NAME = { storia: "coup history", contagio: "contagion", regime: "regime", leader: "leaders and elections", economia: "economy", piazza: "mobilisation", acled: "ACLED monthly" };
const REGION_SHORT = { "Western Africa": "W Africa", "Middle Africa": "Central Africa", "Eastern Africa": "E Africa", "Southern Africa": "Southern Africa",
  "Northern Africa": "N Africa", "Middle East": "Middle East", "Caucasus and Central Asia": "Central Asia", "South Asia": "South Asia",
  "Southeast Asia": "SE Asia", "East Asia": "East Asia", "Central America": "C America", "North America": "N America", "South America": "S America" };
const rnd = (seed) => { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

let landPromise;
const loadLand = () => (landPromise ||= Promise.all([
  fetch("/geo/land.json").then((r) => r.json()),
  fetch("/geo/land.bin").then((r) => r.arrayBuffer()),
]).then(([meta, bin]) => ({ meta, dots: new Int16Array(bin) })));

const cellKey = (lon, lat, step, dr = 0, dc = 0) => {
  const row = Math.floor((lat + 90) / step) + dr, n = Math.max(1, Math.round((360 / step) * Math.cos((-90 + (row + 0.5) * step) * RAD)));
  return row * 4096 + ((Math.floor(((lon + 180) / 360) * n) + dc + n) % n);
};

const NO_INSET = { l: 0, r: 0, t: 0, b: 0 };

/** `embed` is a stage inside a page (the home hero, the "when" section, a country page): no wheel capture, so the
 *  page scrolls past it. The console draws its own zoom tools and reaches the camera through `apiRef`. `inset` (px)
 *  is what floating panels cover: every view is drawn in the rest. `shift` moves the globe off centre (clip units),
 *  `fill` scales it, `labels` caps the globe's tags. `bare` (a class name) draws the canvas alone, as a section's
 *  background layer. `pin` is the ref of an element, positioned like the canvas, that follows the selected country
 *  on the globe. An embedded stage that WebGL cannot draw renders nothing, so the still picture under it shows. */
export default function Stage({ view, list, selected, detail, atlas, plane, live, onSelect, focus, onFocus, apiRef, embed = false, inset = NO_INSET, shift = null, fill = 1, labels = embed ? 6 : 10, bare = "", pin = null, onReady }) {
  const canvasRef = useRef(null), engineRef = useRef(null), labelRefs = useRef(new Map()), overlayRef = useRef(null), rootRef = useRef(null);
  const [land, setLand] = useState(null), [failed, setFailed] = useState(false), [tip, setTip] = useState(null);
  const [atlasHover, setAtlasHover] = useState(null), [zoomShown, setZoomShown] = useState(1);
  const [peerData, setPeerData] = useState(null), [size, setSize] = useState({ w: 0, h: 0 });
  const maxRisk = list[0]?.risk || 0.05;
  const sizeRef = useRef({ W: 0, H: 0 }), widths = useRef(new Map());

  useEffect(() => {
    let engine;
    try { engine = createEngine(canvasRef.current); } catch (e) { console.error(e.message); }
    if (!engine) { setFailed(true); return; }
    engineRef.current = engine;
    if (process.env.NODE_ENV !== "production") window.__cx = engine;       // development only: lets the test scripts find a country on screen
    if (apiRef) apiRef.current = { zoom: (f) => engine.zoomAt(0.5, 0.5, f), reset: () => engine.resetCam() };
    let raf = 0;
    loadLand().then((d) => { setLand(d); raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => onReady?.()); }); }).catch(() => setFailed(true));
    if (embed) return () => { cancelAnimationFrame(raf); engine.destroy(); engineRef.current = null; };
    const el = canvasRef.current;
    const wheel = (e) => {                     // native listener: React's onWheel is passive and cannot stop page scroll
      if (engine.state.view === "trace") return; // the trace does not zoom: let the page scroll
      e.preventDefault();
      const r = el.getBoundingClientRect();
      engine.zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0016)));
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => { cancelAnimationFrame(raf); el.removeEventListener("wheel", wheel); engine.destroy(); engineRef.current = null; if (apiRef) apiRef.current = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiRef, embed]);

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

  // ---- TRACE: a ledger. From a reference country (the logistic model's intercept) to this country's forecast, one row per variable
  // group (largest push first), then the logistic model, the average of the models and the published figure. Each group row also
  // places this country among all the others. The rows are crisp SVG (TraceLedger); the swarm only streams inside the bars.
  useEffect(() => {
    if (view === "trace" && !peerData) fetch("/api/trace").then((r) => (r.ok ? r.json() : null)).then((d) => d && setPeerData(d)).catch(() => {});
  }, [view, peerData]);
  useEffect(() => {
    const el = bare ? canvasRef.current : rootRef.current; if (!el) return;
    const read = () => setSize((s) => { const w = Math.round(el.clientWidth), h = Math.round(el.clientHeight); return s.w === w && s.h === h ? s : { w, h }; });
    read();
    const ro = new ResizeObserver(read); ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const { l, r, t, b: b_ } = inset, sx = shift?.x || 0, sy = shift?.y || 0;     // b_: the loops below use b for a beacon
  useEffect(() => {
    const engine = engineRef.current; if (!engine || !size.w || !size.h) return;
    engine.setInset({ l: l / size.w, r: r / size.w, t: t / size.h, b: b_ / size.h });
    engine.setShift(sx, sy); engine.setFill(fill);
  }, [size, l, r, t, b_, sx, sy, fill]);
  const inW = Math.max(0, size.w - l - r), inH = Math.max(0, size.h - t - b_);
  const ledger = useMemo(() => {
    if (!selected || detail?.slug !== selected.slug || !peerData?.ref || inW < 240 || inH < 240) return null;
    const m = ledgerModel({ groups: detail.groups, components: detail.diagnostics?.components, risk: selected.risk, lo: selected.risk_lo, hi: selected.risk_hi,
      ref: peerData.ref, peers: peerData.peers, imputed: selected.structural === false });
    return m ? layoutLedger(m, inW, inH) : { none: true };
  }, [selected, detail, peerData, inW, inH]);
  useEffect(() => {
    const engine = engineRef.current; if (!engine || !ledger || ledger.none) return;
    engine.setLedger({ boxes: ledger.boxes, core: ledger.core }, Math.max(0, riskNorm(selected.risk, maxRisk)));
  }, [ledger, selected, maxRisk]);
  useEffect(() => { engineRef.current?.focus(focus ? GROUP_ORDER.indexOf(focus) : null); }, [focus]);

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
    const top = list.slice(0, labels), all = selected && !pin && !top.some((c) => c.slug === selected.slug) ? [...top, selected] : top;
    return all.map((c) => ({ c, g: land.meta.countries[geo.idxOf.get(c.slug)] })).filter((b) => b.g);
  }, [geo, land, list, selected, labels, pin]);
  useEffect(() => {                         // the overlay's size and each label's width are read here, once, never per frame
    const root = overlayRef.current; if (!root) return;
    const read = () => { sizeRef.current = { W: root.clientWidth, H: root.clientHeight }; for (const [slug, el] of labelRefs.current) widths.current.set(slug, el.offsetWidth); };
    read();
    const ro = new ResizeObserver(read); ro.observe(root);
    document.fonts?.ready.then(read);
    return () => ro.disconnect();
  }, [beacons]);
  useEffect(() => {
    const engine = engineRef.current, root = overlayRef.current, canvasEl = canvasRef.current; if (!engine || (!root && !pin)) return;
    let last = 1, sig = "", dirty = true, nodes = null, box = null;
    const mo = new MutationObserver(() => { dirty = true; nodes = null; });          // new ledger or beacon nodes need placing even if the camera is still
    if (root) mo.observe(root, { childList: true, subtree: true });
    const ro = new ResizeObserver(() => { box = null; dirty = true; });
    ro.observe(canvasEl);
    const at = pin && geo && selected ? land.meta.countries[geo.idxOf.get(selected.slug)] : null;
    const placePin = (s) => {
      const el = pin?.current; if (!el) return;
      box ||= { x: canvasEl.offsetLeft, y: canvasEl.offsetTop, w: canvasEl.clientWidth, h: canvasEl.clientHeight };
      const p = at && s.view === "field" ? engine.project(at.c[0], at.c[1]) : null;
      const seen = p && p.front && p.x > 0.01 && p.x < 0.99 && p.y > 0.02 && p.y < 0.98;
      el.style.opacity = seen ? 1 : 0;
      if (seen) { el.style.transform = `translate(${(box.x + p.x * box.w).toFixed(1)}px, ${(box.y + p.y * box.h).toFixed(1)}px)`; el.classList.toggle("flip", p.x > 0.8); }
    };
    engine.state.onFrame = () => {
      const s = engine.state, c = s.cams[s.view], zl = engine.zoomLevel();
      if (Math.abs(zl - last) > 0.04) { last = zl; setZoomShown(zl); }
      const now = `${s.view}|${s.yaw.toFixed(4)}|${s.pitch.toFixed(4)}|${s.morph.toFixed(3)}|${c.z.toFixed(3)}|${c.x.toFixed(4)}|${c.y.toFixed(4)}|${s.fade.field.toFixed(2)}`;
      if (!dirty && now === sig) return;                                             // nothing moved: no style writes at all
      sig = now; dirty = false;
      placePin(s);
      if (!root) return;
      const { W, H } = sizeRef.current; if (!W || !H) return;
      if (s.view === "field") {
        const placed = [];
        for (const b of beacons) {
          const el = labelRefs.current.get(b.c.slug); if (!el) continue;
          const p = engine.project(b.g.c[0], b.g.c[1]);
          const x = p.x * W, w = widths.current.get(b.c.slug) ?? 80; let y = p.y * H;
          const flip = x + w > W - r - 8, left = flip ? x - w + 6 : x;      // a label that would leave the free stage reads leftwards from its marker
          const seen = p.front && x > l - 4 && x < W - r + 4 && y > t - 4 && y < H - b_ + 4;   // never under a panel
          if (seen) {                                  // stack labels that would collide; the marker stays on the country
            for (let k = 0; k < 8 && placed.some((q) => left < q.x + q.w + 6 && q.x < left + w + 6 && Math.abs(q.y - y) < 19); k++) y += 19;
            placed.push({ x: left, y, w });
          }
          el.classList.toggle("flip", flip);
          el.style.transform = `translate(${left.toFixed(1)}px, ${(p.y * H).toFixed(1)}px)`;
          el.style.setProperty("--dy", `${(y - p.y * H).toFixed(1)}px`);
          el.style.opacity = seen ? 1 : 0;
          el.style.pointerEvents = seen ? "auto" : "none";
        }
        return;
      }
      nodes ||= [...root.querySelectorAll("[data-cx]")];
      let floor = -1e9;                                                              // region names stack downwards, never over each other
      for (const el of nodes) {
        const a = engine.toStage(+el.dataset.cx, +el.dataset.cy);
        let y = a.y * H;
        if (el.classList.contains("cx-region")) { y = Math.max(y, floor + 13); floor = y; }
        el.style.left = `${(a.x * W).toFixed(1)}px`; el.style.top = `${y.toFixed(1)}px`;
        if (el.dataset.cx2) el.style.width = `${Math.max(0, (engine.toStage(+el.dataset.cx2, 0).x - a.x) * W).toFixed(1)}px`;
        el.style.opacity = a.x > -0.02 && a.x < 1.02 && a.y > -0.02 && a.y < 1.02 ? "" : 0;
      }
    };
    return () => { mo.disconnect(); ro.disconnect(); if (engine.state) engine.state.onFrame = null; };
  }, [beacons, view, pin, geo, land, selected, l, r, t, b_]);

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
    if (embed && e.pointerType === "touch" && view !== "field") return;      // a finger on an embedded chart scrolls the page
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
  const canvas = (
    <canvas ref={canvasRef} className={`${view === "field" && !plane ? "grab" : "pan"}${bare ? ` ${bare}` : ""}`} onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp}
      onPointerCancel={onUp} onPointerLeave={onLeave} aria-hidden="true" />
  );
  const tipBox = tip && (
    <div className="cx-tip" style={{ left: Math.max(8, Math.min(tip.x + 14, (canvasRef.current?.clientWidth || 400) - 190)) + (bare ? canvasRef.current?.offsetLeft || 0 : 0), top: tip.y + 14 + (bare ? canvasRef.current?.offsetTop || 0 : 0) }}>
      {tip.c ? (<><b>{tip.c.name}</b><span>{pct(tip.c.risk, 2)} · rank {tip.c.pos}</span><em>{tip.c.region}</em></>)
        : (<><b>{tip.row.name}</b><span>{quarterLabel(tip.q)} · {tip.row.v[tip.q] < 0 ? "no forecast" : pct(tip.row.v[tip.q] / 10000, 2)}</span><em>click to open</em></>)}
    </div>
  );
  if (failed && embed) return null;
  if (bare) return <>{canvas}{tipBox}</>;

  return (
    <div ref={rootRef} className={`cx-stage v-${view}${failed ? " failed" : ""}${embed ? " embed" : ""}`} style={{ "--in-l": `${l}px`, "--in-r": `${r}px`, "--in-t": `${t}px`, "--in-b": `${b_}px` }}>
      {canvas}
      {failed && !embed && <p className="cx-fail">WebGL2 is unavailable in this browser. The watchlist, readout and timeline remain fully usable.</p>}


      <div ref={overlayRef} className={`cx-overlay${zoomShown > 2.2 ? " zin" : ""}`}>
        {view === "field" && beacons.map(({ c }) => (
          <button key={c.slug} ref={(el) => { if (el) labelRefs.current.set(c.slug, el); else labelRefs.current.delete(c.slug); }}
            className={`cx-beacon${c.slug === selected?.slug ? " on" : ""}`} onClick={() => onSelect(c.slug)} tabIndex={embed ? -1 : undefined}>
            <i /><span>{c.name}</span><b>{pct(c.risk)}</b>
          </button>
        ))}

        {view === "atlas" && ridge && ridge.regions.map((g) => (
          <span key={g.name} className="cx-region" data-cx={ATLAS_GEOM.x(1, ridge.pos[g.i]) + 0.02} data-cy={ATLAS_GEOM.yb(ridge.pos[g.i])}>{REGION_SHORT[g.name] || g.name}</span>
        ))}
        {view === "atlas" && atlas && Array.from({ length: 6 }, (_, k) => 1980 + k * 10).map((y) => {
          const t = ((y - atlas.start) * 4) / (atlas.quarters - 1); if (t > 1) return null;
          return <span key={y} className="cx-tick" data-cx={ATLAS_GEOM.x(t, 1)} data-cy={ATLAS_GEOM.yb(1) - 0.03}>{y}</span>;
        })}
        {view === "atlas" && traj && (
          <>
            <span className="cx-guide" data-cx={traj.start.cx} data-cx2={traj.end.cx} data-cy={traj.start.cy} />
            <span className="cx-rowtag" data-cx={traj.start.cx - 0.01} data-cy={traj.start.cy}>{selected.name}</span>
            {traj.coups.map((e) => (
              <span key={e.id} className={`cx-mark ${e.type === "riuscito" ? "ok" : "ko"}`} data-cx={e.cx} data-cy={e.cy}><i />{<small>{e.date.slice(0, 4)}</small>}</span>
            ))}
            <span className="cx-peak" data-cx={traj.peak.cx} data-cy={traj.peak.cy}>Peak {pct(traj.peak.v / 10000)}, {quarterLabel(traj.peak.q)}</span>
            <span className="cx-now" data-cx={traj.now.cx} data-cy={traj.now.cy}><i />Now {pct(traj.now.v / 10000)}</span>
          </>
        )}
        {view === "atlas" && !atlas && <p className="cx-wait">Loading 51 years of forecasts…</p>}

        {view === "trace" && (
          <div className="cx-inner" style={{ left: l, top: t, width: inW, height: inH }}>
            {ledger && !ledger.none && <TraceLedger ledger={ledger} focus={focus} onFocus={onFocus} name={selected.name} />}
            {ledger?.none && <p className="cx-wait">No driver breakdown is published for this country.</p>}
            {!ledger && <p className="cx-wait">Laying out the ledger…</p>}
          </div>
        )}
      </div>

      {view === "atlas" && traj && (
        <div className="cx-traj">
          <b>{selected.name} since {atlas.start}</b>
          <span>Peak <em>{pct(traj.peak.v / 10000)}</em> {quarterLabel(traj.peak.q)}</span>
          <span>Now <em>{pct(traj.now.v / 10000)}</em> {quarterLabel(traj.now.q)}</span>
          <span>Median <em>{pct(traj.median / 10000)}</em></span>
          <span><i className="d" />{traj.coups.length} recorded attempts (confidence A–C)</span>
        </div>
      )}

      {tipBox}
    </div>
  );
}
