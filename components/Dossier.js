"use client";

import { useMemo, useState } from "react";
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
  const endYear = Number(meta.data_end.slice(0, 4));

  const shown = useMemo(
    () => country.coups.filter((e) => ORDER.indexOf(e.conf) <= ORDER.indexOf(minConf)),
    [country.coups, minConf]
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
    if (!slug) { setOther(null); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/countries/${slug}`);
      setOther(r.ok ? await r.json() : null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <section className="card">
        <div className="card-head">
          <h2>Coup archive / since 1900</h2>
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
        {shown.length ? <CoupTimeline events={shown} endYear={endYear} />
                      : <p className="note">No events at this confidence level.</p>}
        {shown.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Date</th><th>Outcome</th><th>Conf.</th><th>Sources</th><th>Notes</th></tr></thead>
              <tbody>
                {[...shown].reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{fmtEventDate(e)}</td>
                    <td><span className={`badge ${e.type}`}>{TYPE_LABEL[e.type]}</span></td>
                    <td><span className="badge conf" title={CONF_LABEL[e.conf]}>{e.conf}</span></td>
                    <td>{e.sources?.replaceAll("V-Dem regimi storici", "V-Dem historical regimes")}</td>
                    <td>
                      {e.label}
                      <small>
                        {[e.self && "self-coup", e.colpus && `Colpus classification: ${COLPUS[e.colpus] || e.colpus}`,
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

      {!country.historical && (
        <>
          <section className="card">
            <div className="card-head">
              <h2>Risk estimates over time</h2>
              <label className="check">Compare with{" "}
                <select className="select" defaultValue="" onChange={(e) => compare(e.target.value)} disabled={busy}>
                  <option value="">None</option>
                  {others.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div>
                <div className="legend">
                  <span><i className="ln s1" />{country.name}</span>
                  {other && <span><i className="ln s2" />{other.name}</span>}
                  <span><i className="ln" />successful coup</span>
                  <span><i className="ln dash" />failed coup</span>
                </div>
                <LineChart series={riskSeries} markers={markers} height={240} fmt={(v) => pct(v, v < 0.1 ? 1 : 0)} />
                {country.structural === false && (
                  <p className="note" style={{ marginTop: 8 }}>
                    Regime, leadership and economic indicators are unavailable for this territory. The estimate relies on coup history and ACLED signals, with weaker coverage.
                  </p>
                )}
                {other && (
                  <p className="note" style={{ marginTop: 8 }}>
                    Latest: {country.name} {pct(country.risk)}, {other.name} {pct(other.risk)}. Attempts since 1900:{" "}
                    {country.attempts} versus {other.attempts}.
                  </p>
                )}
              </div>
              <div>
                {country.groups?.length > 0 && <><h3>Contributions to the latest estimate</h3>
                <p className="note" style={{ margin: "0 0 4px" }}>Contribution of each factor group relative to an average country.</p>
                <HBars rows={country.groups || []} value={(r) => r.contrib} label={(r) => labelEn(r.label)} diverging labelWidth={250}
                       cls={(r) => (r.contrib >= 0 ? "bar-up" : "bar-down")}
                       fmt={(r) => (r.contrib >= 0 ? "+" : "−") + dec(Math.abs(r.contrib))}
                       tipFor={(r) => (<><b>{labelEn(r.label)}</b>{r.contrib >= 0 ? "Increases" : "Reduces"} risk relative to an average country</>)} />
                </>}<h3 style={{ marginTop: 14 }}>Leading individual factors</h3>
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

          <section className="card">
            <h2>Monthly observations / ACLED</h2>
            <p className="note">Vertical lines mark coups. Counts also depend on the extent of ACLED coverage over time.</p>
            <div className="small-multiples">
              {SERIES.map(([k, title]) => (
                <div key={k}>
                  <p className="sm-title">{title}</p>
                  <LineChart series={[{ name: title, points: monthly(country.series.start, country.series[k]) }]}
                             markers={markers} height={170} area fmt={num} />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
