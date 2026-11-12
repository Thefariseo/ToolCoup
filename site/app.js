/* Osservatorio rischio golpe - front-end statico. Legge data/forecast.json prodotto dalla pipeline. */
(async function () {
  const $ = (s) => document.querySelector(s);
  const pct = (v, d = 1) => (v == null ? "–" : (v * 100).toFixed(d).replace(".", ",") + "%");
  const num = (v) => v.toLocaleString("it-IT");
  const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const ym = (s) => { const [y, m] = s.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 1)); };
  const addM = (d, k) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + k, 1));
  const fmtM = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let D;
  try {
    D = await (await fetch("data/forecast.json", { cache: "no-cache" })).json();
  } catch (e) {
    $("#lede").textContent = "Impossibile caricare data/forecast.json: esegui prima la pipeline (python pipeline/run.py).";
    return;
  }
  const M = D.meta, C = D.countries, H = D.history;
  const byIso = new Map(C.filter((c) => c.iso).map((c) => [c.iso, c]));
  let selected = C[0];

  // ---------------------------------------------------------------- tooltip
  const tip = $("#tooltip");
  function showTip(evt, html) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY + 14;
    if (x + r.width > innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = evt.clientY - r.height - 14;
    tip.style.left = Math.max(8, x) + "px"; tip.style.top = Math.max(8, y) + "px";
  }
  const hideTip = () => { tip.hidden = true; };

  // ---------------------------------------------------------------- testata e KPI
  if (M.demo) $("#demo-banner").hidden = false;
  const from = ym(M.forecast_from), to = ym(M.forecast_to);
  $("#lede").textContent =
    `Probabilità stimata di almeno un tentativo di colpo di stato in ciascun paese tra ${fmtM(from)} e ${fmtM(to)}, ` +
    `a partire dall'attività di conflitto e protesta registrata fino a ${fmtM(ym(M.data_end))}.`;
  $("#forecast-sub").textContent =
    `Orizzonte di ${M.horizon} mesi. In media, in un paese-mese qualsiasi la probabilità è ${pct(M.base_rate)} (tasso base).`;
  const top = C[0];
  const kpis = [
    [pct(top.risk), `Rischio più alto: ${top.name}`],
    [num(M.n_countries), "Paesi monitorati"],
    [num(M.n_coups_acled), `Tentativi di golpe nel periodo ACLED (${M.n_success_acled} riusciti)`],
    [D.metrics.logit ? D.metrics.logit.auc.toFixed(2).replace(".", ",") : "–", "AUC fuori campione del modello"],
    [num(M.n_events), "Eventi ACLED analizzati"],
  ];
  $("#kpis").innerHTML = kpis.map(([v, l]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${esc(l)}</div></div>`).join("");
  $("#footer").textContent =
    `Aggiornato il ${M.generated}. Eventi: ACLED (acleddata.com), dal ${M.data_start}. Golpe: Powell & Thyne, ` +
    `"Global instances of coups from 1950 to present". ${M.demo ? "Versione demo con dati sintetici." : ""}`;

  // ---------------------------------------------------------------- scala di colore (multipli del tasso base)
  const breaks = [0.5, 1, 2, 4, 8].map((k) => k * M.base_rate);
  const cls = (v) => d3.bisectRight(breaks, v);            // 0..5
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const seq = (i) => css(`--seq-${i + 1}`);

  function legend() {
    const lab = (i) => i === 0 ? `< ${pct(breaks[0])}` : i === 5 ? `> ${pct(breaks[4])}` : `${pct(breaks[i - 1])} – ${pct(breaks[i])}`;
    $("#map-legend").innerHTML = d3.range(6).map((i) => `<span><i class="sw" style="background:${seq(i)}"></i>${lab(i)}</span>`).join("") +
      `<span><i class="sw" style="background:${css("--nodata")}"></i>non coperto</span>`;
  }

  // ---------------------------------------------------------------- mappa
  let world = null;
  async function loadWorld() {
    try {
      const topo = await (await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json")).json();
      world = topojson.feature(topo, topo.objects.countries).features.filter((f) => f.id !== "010");
    } catch (e) {
      $("#map").innerHTML = '<p class="note">Mappa non disponibile (impossibile caricare i confini). La classifica resta consultabile.</p>';
    }
  }
  function drawMap() {
    if (!world) return;
    const w = 760, h = 380;
    const proj = d3.geoNaturalEarth1().fitSize([w, h], { type: "FeatureCollection", features: world });
    const path = d3.geoPath(proj);
    const svg = d3.select("#map").html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`).attr("role", "img")
      .attr("aria-label", "Mappa mondiale del rischio di golpe per paese");
    svg.selectAll("path").data(world).join("path")
      .attr("class", (f) => "c" + (byIso.has(f.id) ? " has" : "") + (selected && selected.iso === f.id ? " sel" : ""))
      .attr("d", path)
      .attr("fill", (f) => byIso.has(f.id) ? seq(cls(byIso.get(f.id).risk)) : css("--nodata"))
      .on("mousemove", (evt, f) => {
        const c = byIso.get(f.id);
        showTip(evt, c ? `<b>${esc(c.name)}</b>Rischio ${pct(c.risk)} · ${c.rank}° su ${C.length}` :
          `<b>${esc(f.properties.name)}</b><span class="t2">non coperto</span>`);
      })
      .on("mouseleave", hideTip)
      .on("click", (evt, f) => { if (byIso.has(f.id)) select(byIso.get(f.id), true); });
    svg.selectAll("path.sel").raise();
  }

  // ---------------------------------------------------------------- classifica
  const maxRisk = d3.max(C, (c) => c.risk);
  function drawTable() {
    const q = $("#search").value.trim().toLowerCase();
    const rows = C.filter((c) => !q || c.name.toLowerCase().includes(q) || (c.region || "").toLowerCase().includes(q));
    $("#ranking tbody").innerHTML = rows.map((c) => {
      const d = c.risk_3m_ago == null ? null : c.risk - c.risk_3m_ago;
      const dTxt = d == null ? "–" : (d > 0 ? "▲ +" : d < 0 ? "▼ −" : "") + (Math.abs(d) * 100).toFixed(1).replace(".", ",") + " pt";
      return `<tr data-n="${esc(c.name)}" class="${c === selected ? "sel" : ""}">
        <td class="num">${c.rank}</td>
        <td>${esc(c.name)}<div class="region">${esc(c.region || "")}</div></td>
        <td><div class="riskcell"><div class="riskbar"><i style="width:${(c.risk / maxRisk * 100).toFixed(1)}%"></i></div><span>${pct(c.risk)}</span></div></td>
        <td class="num">${dTxt}</td></tr>`;
    }).join("") || `<tr><td colspan="4" class="region">Nessun paese trovato.</td></tr>`;
  }
  $("#ranking tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-n]");
    if (tr) select(C.find((c) => c.name === tr.dataset.n), false);
  });
  $("#search").addEventListener("input", drawTable);

  // ---------------------------------------------------------------- grafico a linea riusabile
  function lineChart(el, { dates, values, coups = [], h = 200, fmt = (v) => num(v), area = false, label = "" }) {
    const w = 560, m = { t: 14, r: 12, b: 22, l: 44 };
    const x = d3.scaleUtc().domain(d3.extent(dates)).range([m.l, w - m.r]);
    const y = d3.scaleLinear().domain([0, d3.max(values) || 1]).nice(4).range([h - m.b, m.t]);
    const svg = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("line").data(y.ticks(4)).join("line").attr("class", "gridline")
      .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").selectAll("text").data(y.ticks(4)).join("text").attr("x", m.l - 6).attr("y", y)
      .attr("dy", "0.32em").attr("text-anchor", "end").text(fmt);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).ticks(6).tickSize(3).tickFormat((d) => d.getUTCFullYear()));
    const inRange = coups.filter((c) => c.d >= dates[0] && c.d <= dates[dates.length - 1]);
    svg.append("g").selectAll("line").data(inRange).join("line")
      .attr("class", (c) => "coup" + (c.success ? "" : " failed"))
      .attr("x1", (c) => x(c.d)).attr("x2", (c) => x(c.d)).attr("y1", m.t).attr("y2", h - m.b);
    const pts = dates.map((d, i) => [d, values[i]]).filter((p) => p[1] != null);
    if (area) svg.append("path").attr("class", "area")
      .attr("d", d3.area().x((p) => x(p[0])).y0(y(0)).y1((p) => y(p[1]))(pts));
    svg.append("path").attr("class", "line").attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts));
    const cross = svg.append("line").attr("class", "cross").attr("y1", m.t).attr("y2", h - m.b).attr("opacity", 0);
    const dot = svg.append("circle").attr("class", "dot").attr("r", 4).attr("opacity", 0);
    svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b)
      .attr("fill", "transparent")
      .on("mousemove", (evt) => {
        const [px] = d3.pointer(evt);
        const i = Math.max(0, Math.min(pts.length - 1, d3.bisector((p) => p[0]).center(pts, x.invert(px))));
        const p = pts[i]; if (!p) return;
        cross.attr("x1", x(p[0])).attr("x2", x(p[0])).attr("opacity", 1);
        dot.attr("cx", x(p[0])).attr("cy", y(p[1])).attr("opacity", 1);
        const cp = inRange.find((c) => +c.d === +p[0]);
        showTip(evt, `<b>${fmtM(p[0])}</b>${esc(label)}: ${fmt(p[1])}` +
          (cp ? `<br><span class="t2">Golpe ${cp.success ? "riuscito" : "fallito"}</span>` : ""));
      })
      .on("mouseleave", () => { cross.attr("opacity", 0); dot.attr("opacity", 0); hideTip(); });
  }

  // ---------------------------------------------------------------- barre orizzontali
  function hbars(el, rows, { value, label, cls: klass, fmt, diverging = false, tipHtml }) {
    const w = 520, rowH = 26, m = { t: 4, r: 56, b: 4, l: diverging ? 250 : 170 };
    const h = m.t + m.b + rows.length * rowH;
    const ext = d3.max(rows, (r) => Math.abs(value(r))) || 1;
    const x = d3.scaleLinear().domain(diverging ? [-ext, ext] : [0, ext]).range([m.l, w - m.r]);
    const svg = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    const g = svg.selectAll("g").data(rows).join("g").attr("transform", (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append("text").attr("class", "lab").attr("x", m.l - 8).attr("y", rowH / 2).attr("dy", "0.32em")
      .attr("text-anchor", "end").text((r) => label(r).length > (diverging ? 38 : 26) ? label(r).slice(0, diverging ? 37 : 25) + "…" : label(r));
    g.append("rect").attr("class", klass).attr("rx", 3)
      .attr("x", (r) => Math.min(x(0), x(value(r)))).attr("y", 5)
      .attr("width", (r) => Math.max(1, Math.abs(x(value(r)) - x(0)))).attr("height", rowH - 10);
    g.append("text").attr("x", (r) => (value(r) >= 0 ? x(value(r)) + 6 : x(value(r)) - 6)).attr("y", rowH / 2).attr("dy", "0.32em")
      .attr("text-anchor", (r) => (value(r) >= 0 ? "start" : "end")).text((r) => fmt(r));
    if (diverging) svg.append("line").attr("class", "zero").attr("x1", x(0)).attr("x2", x(0)).attr("y1", 0).attr("y2", h);
    g.append("rect").attr("width", w).attr("height", rowH).attr("fill", "transparent")
      .on("mousemove", (evt, r) => showTip(evt, tipHtml(r))).on("mouseleave", hideTip);
  }

  // ---------------------------------------------------------------- scheda paese
  function drawDetail() {
    const c = selected;
    const coups = c.coups.map((k) => ({ d: ym(k.date), success: k.success }));
    const ratio = c.risk / M.base_rate;
    const last = c.coups.length ? c.coups[c.coups.length - 1] : null;
    $("#detail").innerHTML = `
      <div class="detail-head">
        <h2>${esc(c.name)}</h2>
        <span class="big">${pct(c.risk)}</span>
        <span class="sub">${c.rank}° su ${C.length} · ${ratio >= 1 ? ratio.toFixed(1).replace(".", ",") + " volte il tasso base" : "sotto il tasso base"}
          · ${last ? `ultimo tentativo: ${fmtM(ym(last.date))} (${last.success ? "riuscito" : "fallito"})` : "nessun tentativo dal 1950"}</span>
      </div>
      <div class="detail-grid">
        <div>
          <h3>Rischio stimato nel tempo</h3>
          <div class="legend"><span><i class="ln"></i>golpe riuscito</span><span><i class="ln dash"></i>golpe fallito</span></div>
          <div id="d-risk" class="chart"></div>
        </div>
        <div>
          <h3>Cosa spinge la stima</h3>
          <div class="legend"><span><i class="sw" style="background:var(--up)"></i>aumenta il rischio</span><span><i class="sw" style="background:var(--down)"></i>lo riduce</span></div>
          <div id="d-drivers" class="chart"></div>
        </div>
      </div>
      <h3 style="margin-top:16px">Attività mensile registrata da ACLED</h3>
      <div id="d-series" class="small-multiples"></div>`;

    const rh = c.risk_hist;
    if (rh.start && rh.values.length > 1) {
      const d0 = ym(rh.start);
      lineChart("#d-risk", { dates: rh.values.map((_, i) => addM(d0, i)), values: rh.values, coups, h: 230,
        fmt: (v) => pct(v, v < 0.1 ? 1 : 0), label: `Rischio a ${M.horizon} mesi` });
    } else $("#d-risk").innerHTML = '<p class="note">Storia troppo breve per una serie storica del rischio.</p>';

    hbars("#d-drivers", c.drivers, {
      value: (r) => r.contrib, label: (r) => r.label, diverging: true,
      cls: (r) => (r.contrib >= 0 ? "bar-up" : "bar-down"),
      fmt: (r) => (r.contrib >= 0 ? "+" : "−") + Math.abs(r.contrib).toFixed(2).replace(".", ","),
      tipHtml: (r) => `<b>${esc(r.label)}</b>${r.contrib >= 0 ? "Aumenta" : "Riduce"} il rischio rispetto a un paese medio<br><span class="t2">contributo ${r.contrib.toFixed(2)} (log-odds)</span>`,
    });

    const s0 = ym(c.series.start);
    const dates = c.series.unrest.map((_, i) => addM(s0, i));
    const defs = [["unrest", "Proteste e disordini"], ["violence", "Eventi di violenza armata"],
                  ["fatalities", "Vittime"], ["infighting", "Scontri tra forze statali"]];
    const box = d3.select("#d-series");
    defs.forEach(([k, title]) => {
      const div = box.append("div");
      div.append("p").attr("class", "sm-title").text(title);
      lineChart(div.append("div").attr("class", "chart").node(), { dates, values: c.series[k], coups, h: 170, area: true, label: title });
    });
  }

  function select(c, scroll) {
    selected = c;
    drawTable(); drawMap(); drawDetail();
    if (scroll) $("#detail").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------------------------------------------------------------- storia: golpe per anno
  function drawYears() {
    const data = H.per_year, w = 1100, h = 260, m = { t: 10, r: 10, b: 24, l: 34 };
    const x = d3.scaleBand().domain(data.map((d) => d.year)).range([m.l, w - m.r]).paddingInner(0.25);
    const y = d3.scaleLinear().domain([0, d3.max(data, (d) => d.success + d.failed) || 1]).nice(5).range([h - m.b, m.t]);
    const svg = d3.select("#chart-years").html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("g").selectAll("line").data(y.ticks(5)).join("line").attr("class", "gridline")
      .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
    svg.append("g").selectAll("text").data(y.ticks(5)).join("text").attr("x", m.l - 6).attr("y", y).attr("dy", "0.32em")
      .attr("text-anchor", "end").text((d) => d);
    svg.append("g").selectAll("text").data(data.filter((d) => d.year % 10 === 0)).join("text")
      .attr("x", (d) => x(d.year) + x.bandwidth() / 2).attr("y", h - 6).attr("text-anchor", "middle").text((d) => d.year);
    const g = svg.append("g").selectAll("g").data(data).join("g");
    g.append("rect").attr("class", "bar-s").attr("x", (d) => x(d.year)).attr("width", x.bandwidth())
      .attr("y", (d) => y(d.success)).attr("height", (d) => y(0) - y(d.success));
    g.append("rect").attr("class", "bar-f").attr("x", (d) => x(d.year)).attr("width", x.bandwidth())
      .attr("y", (d) => y(d.success + d.failed)).attr("height", (d) => Math.max(0, y(d.success) - y(d.success + d.failed) - (d.success && d.failed ? 1.5 : 0)));
    g.append("rect").attr("x", (d) => x(d.year) - 1).attr("width", x.step()).attr("y", m.t).attr("height", h - m.t - m.b)
      .attr("fill", "transparent")
      .on("mousemove", (evt, d) => showTip(evt, `<b>${d.year}</b>${d.success + d.failed} tentativi<br><span class="t2">${d.success} riusciti · ${d.failed} falliti</span>`))
      .on("mouseleave", hideTip);
    $("#year-legend").innerHTML = `<span><i class="sw" style="background:var(--series-1)"></i>riusciti</span><span><i class="sw" style="background:var(--series-2)"></i>falliti</span>`;
  }

  function drawTop() {
    hbars("#chart-top", H.top_countries, {
      value: (r) => r.attempts, label: (r) => r.name, cls: "bar-s",
      fmt: (r) => `${r.attempts} (${r.success} riusciti)`,
      tipHtml: (r) => `<b>${esc(r.name)}</b>${r.attempts} tentativi, ${r.success} riusciti<br><span class="t2">tasso di successo ${pct(r.success / r.attempts, 0)}</span>`,
    });
  }

  function drawFactors() {
    const rows = H.factors.slice(0, 12), w = 520, rowH = 26, m = { t: 4, r: 44, b: 22, l: 250 };
    const h = m.t + m.b + rows.length * rowH;
    const ext = Math.max(d3.max(rows, (r) => Math.abs(Math.log(r.odds_ratio))), Math.log(1.5));
    const x = d3.scaleLog().domain([Math.exp(-ext), Math.exp(ext)]).range([m.l, w - m.r]);
    const svg = d3.select("#chart-factors").html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
    svg.append("line").attr("class", "zero").attr("x1", x(1)).attr("x2", x(1)).attr("y1", 0).attr("y2", h - m.b);
    svg.append("g").attr("class", "axis").attr("transform", `translate(0,${h - m.b})`)
      .call(d3.axisBottom(x).tickValues([0.125, 0.25, 0.5, 1, 2, 4, 8].filter((v) => v >= x.domain()[0] && v <= x.domain()[1]))
        .tickFormat((d) => "×" + String(d).replace(".", ",")).tickSize(3));
    const g = svg.selectAll("g.r").data(rows).join("g").attr("class", "r").attr("transform", (r, i) => `translate(0,${m.t + i * rowH})`);
    g.append("text").attr("class", "lab").attr("x", m.l - 8).attr("y", rowH / 2).attr("dy", "0.32em").attr("text-anchor", "end")
      .text((r) => r.label.length > 38 ? r.label.slice(0, 37) + "…" : r.label);
    g.append("line").attr("class", "gridline").attr("x1", x(1)).attr("x2", (r) => x(r.odds_ratio)).attr("y1", rowH / 2).attr("y2", rowH / 2).attr("stroke-width", 2);
    g.append("circle").attr("class", (r) => (r.odds_ratio >= 1 ? "bar-up" : "bar-down")).attr("r", 5).attr("cx", (r) => x(r.odds_ratio)).attr("cy", rowH / 2);
    g.append("rect").attr("width", w).attr("height", rowH).attr("fill", "transparent")
      .on("mousemove", (evt, r) => showTip(evt, `<b>${esc(r.label)}</b>Odds ratio ×${r.odds_ratio.toFixed(2).replace(".", ",")}<br><span class="t2">per +1 deviazione standard</span>`))
      .on("mouseleave", hideTip);
  }

  function drawEventStudy() {
    const es = H.event_study;
    $("#es-note").textContent = `Media su ${es.n} tentativi di golpe nel periodo coperto da ACLED. Valori in deviazioni standard rispetto alla norma di ciascun paese; il mese 0 è quello del golpe.`;
    const defs = [["unrest", "Proteste e disordini"], ["violence", "Violenza armata"], ["fatalities", "Vittime"], ["infighting", "Scontri tra forze statali"]];
    const all = defs.flatMap(([k]) => es.series[k]).filter((v) => v != null);
    const lo = Math.min(-0.2, d3.min(all)), hi = Math.max(0.5, d3.max(all));
    const box = d3.select("#chart-es").html("");
    defs.forEach(([k, title]) => {
      const div = box.append("div");
      div.append("p").attr("class", "sm-title").text(title);
      const w = 300, h = 170, m = { t: 10, r: 10, b: 24, l: 34 };
      const x = d3.scaleLinear().domain(d3.extent(es.offsets)).range([m.l, w - m.r]);
      const y = d3.scaleLinear().domain([lo, hi]).nice(4).range([h - m.b, m.t]);
      const svg = div.append("div").attr("class", "chart").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
      svg.append("g").selectAll("line").data(y.ticks(4)).join("line").attr("class", (d) => (d === 0 ? "zero" : "gridline"))
        .attr("x1", m.l).attr("x2", w - m.r).attr("y1", y).attr("y2", y);
      svg.append("g").selectAll("text").data(y.ticks(4)).join("text").attr("x", m.l - 6).attr("y", y).attr("dy", "0.32em")
        .attr("text-anchor", "end").text((d) => d3.format("+.1f")(d).replace(".", ","));
      svg.append("line").attr("class", "coup").attr("x1", x(0)).attr("x2", x(0)).attr("y1", m.t).attr("y2", h - m.b);
      svg.append("g").selectAll("text").data([-12, -6, 0, 6]).join("text").attr("x", x).attr("y", h - 6)
        .attr("text-anchor", "middle").text((d) => (d === 0 ? "golpe" : (d > 0 ? "+" : "") + d + " mesi"));
      const pts = es.offsets.map((o, i) => [o, es.series[k][i]]).filter((p) => p[1] != null);
      svg.append("path").attr("class", "line").attr("d", d3.line().x((p) => x(p[0])).y((p) => y(p[1]))(pts));
      const dot = svg.append("circle").attr("class", "dot").attr("r", 4).attr("opacity", 0);
      svg.append("rect").attr("x", m.l).attr("y", m.t).attr("width", w - m.l - m.r).attr("height", h - m.t - m.b).attr("fill", "transparent")
        .on("mousemove", (evt) => {
          const o = Math.round(x.invert(d3.pointer(evt)[0])), p = pts.find((q) => q[0] === o);
          if (!p) return;
          dot.attr("cx", x(p[0])).attr("cy", y(p[1])).attr("opacity", 1);
          showTip(evt, `<b>${o === 0 ? "Mese del golpe" : (o > 0 ? o + " mesi dopo" : -o + " mesi prima")}</b>${esc(title)}: ${d3.format("+.2f")(p[1]).replace(".", ",")} dev. std.`);
        })
        .on("mouseleave", () => { dot.attr("opacity", 0); hideTip(); });
    });
  }

  // ---------------------------------------------------------------- validazione
  function drawMetrics() {
    const names = { logit: "Regressione logistica (modello pubblicato)", gbm: "Gradient boosting (confronto)", storia: "Solo storia golpista, senza ACLED" };
    const f = (v, d) => v.toFixed(d).replace(".", ",");
    $("#metrics tbody").innerHTML = Object.entries(D.metrics).map(([k, v]) => v ? `<tr><td>${names[k] || k}</td>
      <td class="num">${f(v.auc, 3)}</td><td class="num">${f(v.pr_auc, 3)}</td><td class="num">${f(v.brier, 4)}</td>
      <td class="num">${pct(v.top10_recall, 0)}</td></tr>` : `<tr><td>${names[k] || k}</td><td colspan="4" class="region">non calcolabile</td></tr>`).join("");
    $("#valid-sub").textContent = `Previsioni fuori campione dal ${M.first_test_year}: ${num(M.n_oos)} paese-mesi, di cui ${num(M.n_oos_pos)} seguiti da un golpe entro ${M.horizon} mesi.`;
    $("#valid-note").textContent = `AUC-ROC: 0,5 equivale al caso, 1 è perfetto. AUC-PR va confrontata con il tasso base (${pct(M.base_rate)}). ` +
      `L'ultima colonna indica quanti dei periodi pre-golpe ricadevano, mese per mese, nel 10% di paesi con il rischio stimato più alto.`;
  }

  // ---------------------------------------------------------------- avvio
  legend(); drawTable(); drawDetail(); drawYears(); drawTop(); drawFactors(); drawEventStudy(); drawMetrics();
  await loadWorld(); drawMap();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { legend(); drawMap(); });
})();
