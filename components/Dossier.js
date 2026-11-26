"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { HBars, LineChart } from "@/components/charts";
import CoupTimeline from "@/components/CoupTimeline";
import { labelEn } from "@/lib/english";
import { addMonths, CONF_LABEL, dec, fmtEventDate, num, parseDate, pct, TYPE_LABEL } from "@/lib/format";

const SERIES = [["unrest", "Protests & riots"], ["violence", "Political violence events"],
                ["fatalities", "Reported fatalities"], ["infighting", "State-force infighting"]];
const ORDER = ["A", "B", "C", "D"];
const COLPUS = {
  "coup plot": "plot", autogolpe: "self-coup", "prior defection": "prior defection", mutiny: "mutiny",
  legal: "legal transfer", "not exist": "unconfirmed event", "not regime leader": "not against regime leader",
  assassination: "assassination", protest: "protest", foreign: "foreign intervention", combined: "duplicate",
};

const monthly = (start, values) => {
  const d0 = parseDate(start);
  return values.map((v, i) => [addMonths(d0, i), v]).filter((p) => p[1] != null);
};

export default function Dossier({ country, others, meta }) {
  const [minConf, setMinConf] = useState("C");
  const [other, setOther] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  const endYear = Number(meta.data_end.slice(0, 4));

  const shown = useMemo(
    () => country.coups.filter((e) => ORDER.indexOf(e.conf) <= ORDER.indexOf(minConf) && (includeDuplicates || !e.dup)),
    [country.coups, minConf, includeDuplicates]
  );
  const markers = useMemo(
    () => country.coups.filter((e) => e.type !== "complotto" && "AB".includes(e.conf) && !e.dup)
      .map((e) => ({ d: parseDate(e.date.slice(0, 7)), success: e.type === "riuscito" })),
    [country.coups]
  );
  const risk = country.risk_hist?.start ? monthly(country.risk_hist.start, country.risk_hist.values) : [];
  const riskSeries = [{ name: country.name, cls: "", points: risk }];
  if (other?.risk_hist?.start) {
    riskSeries.push({ name: other.name, cls: "s2", points: monthly(other.risk_hist.start, other.risk_hist.values) });
  }

  async function compare(slug) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setError("");
    if (!slug) { setOther(null); setBusy(false); return; }
    setBusy(true);
    setOther(null);
    try {
      const r = await fetch(`/api/countries/${slug}`, { signal: controller.signal });
      if (!r.ok) throw new Error("Comparison unavailable. Please select a country to try again.");
      const next = await r.json();
      if (!controller.signal.aborted) setOther(next);
    } catch (err) {
      if (!controller.signal.aborted && err.name !== "AbortError") setError("Comparison unavailable. Please select a country to try again.");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <>


      {!country.historical && (
        <>
          <section className="block" id="history">
            <div className="block-head">
              <h2>Risk estimates over time</h2>
              <label className="check">Compare with{" "}
                <select className="select" defaultValue="" onChange={(e) => compare(e.target.value)}>
                  <option value="">None</option>
                  {others.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
                </select>
              </label>
            </div>
            {busy && <p className="note">Loading comparison…</p>}
            {error && <p role="alert">{error}</p>}
            <div className="cols-2">
              <div>
                <div className="legend">
                  <span><i className="ln s1" />{country.name}</span>
                  {other && <span><i className="ln s2" />{other.name}</span>}
                  <span><i className="ln ok" />successful coup</span>
                  <span><i className="ln ko" />failed coup</span>
                </div>
                <LineChart series={riskSeries} markers={markers} height={240} fmt={(v) => pct(v, v < 0.1 ? 1 : 0)} />
                {country.structural === false && (
                  <p className="note">
                    We have no regime, leadership or economic indicators for this territory, so its estimate rests on coup history and ACLED signals alone.
                  </p>
                )}
                {other && (
                  <p className="note">
                    Latest: {country.name} {pct(country.risk)}, {other.name} {pct(other.risk)}. Attempts since 1900:{" "}
                    {country.attempts} versus {other.attempts}.
                  </p>
                )}
              </div>
              <div>
                {country.groups?.length > 0 && <><h3>Contributions to the latest estimate</h3>
                <p className="note">Logistic-component log-odds contributions relative to its training reference; not percentage points or causal effects.</p>
                <HBars rows={country.groups || []} value={(r) => r.contrib} label={(r) => labelEn(r.label)} diverging labelWidth={250}
                       cls={(r) => (r.contrib >= 0 ? "bar-up" : "bar-down")}
                       fmt={(r) => (r.contrib >= 0 ? "+" : "−") + dec(Math.abs(r.contrib))}
                       tipFor={(r) => (<><b>{labelEn(r.label)}</b>{r.contrib >= 0 ? "Increases" : "Reduces"} risk relative to an average country</>)} />
                </>}<h3>Leading individual factors</h3>
                <div className="legend">
                  <span><i className="sw" style={{ background: "var(--up)" }} />increases risk</span>
                  <span><i className="sw" style={{ background: "var(--down)" }} />reduces risk</span>
                </div>
                <HBars rows={country.drivers || []} value={(r) => r.contrib} label={(r) => labelEn(r.label)} diverging labelWidth={250}
                       cls={(r) => (r.contrib >= 0 ? "bar-up" : "bar-down")}
                       fmt={(r) => (r.contrib >= 0 ? "+" : "−") + dec(Math.abs(r.contrib))}
                       tipFor={(r) => (<><b>{labelEn(r.label)}</b>{r.contrib >= 0 ? "Increases" : "Reduces"} risk relative to an average country</>)} />
              </div>
            </div>
          </section>

          {country.series?.start && <section className="block" id="observations">
            <h2>Monthly ACLED observations</h2>
            <p className="note">Vertical lines mark coups. Counts also depend on the extent of ACLED coverage over time.</p>
            <div className="small-multiples">
              {SERIES.map(([k, title]) => (
                <div key={k}>
                  <p className="sm-title">{title}</p>
                  <LineChart series={[{ name: title, points: monthly(country.series.start, country.series[k] || []) }]}
                             markers={markers} height={170} area fmt={num} />
                </div>
              ))}
            </div>
          </section>}
        </>
      )}
      <section className="block" id="archive">
        <div className="block-head">
          <h2>Coup archive since 1900</h2>
          <label className="check">Minimum confidence{" "}
            <select className="select" value={minConf} onChange={(e) => setMinConf(e.target.value)}>
              <option value="A">high (A)</option>
              <option value="B">good (A–B)</option>
              <option value="C">medium (A–C)</option>
              <option value="D">all (A–D)</option>
            </select>
          </label>
        </div>
        <p className="note">
          Each point represents an event. Larger points indicate stronger source agreement. Failed attempts before 1946 are incompletely recorded.
        </p>
        <label className="check"><input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} /> Include possible duplicates</label>
        <p className="note">{shown.length} records shown. Plots are listed separately and do not count as attempts. Disputed records keep the classification their sources give.</p>
        {shown.length ? <CoupTimeline events={shown} endYear={endYear} />
                      : <p className="note">No events at this confidence level.</p>}
        {shown.length > 0 && (
          <div className="table-scroll" tabIndex={0} role="region" aria-label="Recorded events">
            <table>
              <thead><tr><th>Date</th><th>Outcome</th><th>Conf.</th><th>Sources</th><th>Notes</th></tr></thead>
              <tbody>
                {[...shown].reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{fmtEventDate(e)}</td>
                    <td><span className={`tag ${e.type}`}>{TYPE_LABEL[e.type]}</span></td>
                    <td><span className="tag conf" title={CONF_LABEL[e.conf]}>{e.conf}</span></td>
                    <td className="src-cell">
                      <span className="src-names">{e.sources}</span>
                      {e.links?.length > 0 && <span className="src-links">
                        {e.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className={l.kind} title={l.kind === "dataset" ? `${l.label} dataset (not the individual event)` : l.kind === "search" ? "No catalogued article; search Wikipedia" : `${l.label}: entry for this event`}>{l.label}<span aria-hidden="true"> ↗</span></a>)}
                      </span>}
                    </td>
                    <td>
                      {e.label}
                      <small>
                        {[e.self && "self-coup", e.disputed && "disputed classification", e.colpus && `Colpus classification: ${COLPUS[e.colpus] || e.colpus}`,
                          e.dup && "possible duplicate of another event"].filter(Boolean).join(" · ")}
                      </small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
