"use client";

import { useMemo, useState } from "react";
import { HBars, LineChart } from "@/components/charts";
import CoupTimeline from "@/components/CoupTimeline";
import { addMonths, CONF_LABEL, dec, fmtEventDate, num, parseDate, pct, TYPE_LABEL } from "@/lib/format";

const SERIES = [["unrest", "Proteste e disordini"], ["violence", "Eventi di violenza armata"],
                ["fatalities", "Vittime"], ["infighting", "Scontri tra forze statali"]];
const ORDER = ["A", "B", "C", "D"];
const COLPUS = {
  "coup plot": "complotto", autogolpe: "autogolpe", "prior defection": "defezione precedente", mutiny: "ammutinamento",
  legal: "avvicendamento legale", "not exist": "evento non riscontrato", "not regime leader": "non contro il capo del regime",
  assassination: "assassinio", protest: "protesta", foreign: "intervento straniero", combined: "doppione",
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
          <h2>Colpi di stato dal 1900</h2>
          <label className="check">Affidabilità minima{" "}
            <select className="select" value={minConf} onChange={(e) => setMinConf(e.target.value)}>
              <option value="A">alta (A)</option>
              <option value="B">buona (A–B)</option>
              <option value="C">media (A–C)</option>
              <option value="D">tutte (A–D)</option>
            </select>
          </label>
        </div>
        <p className="note">
          Ogni punto è un evento; più è grande, più sono solide le fonti. Prima del 1946 i tentativi falliti sono
          registrati solo in parte.
        </p>
        {shown.length ? <CoupTimeline events={shown} endYear={endYear} />
                      : <p className="note">Nessun evento a questo livello di affidabilità.</p>}
        {shown.length > 0 && (
          <div className="table-scroll">
            <table>
              <thead><tr><th>Data</th><th>Esito</th><th>Affid.</th><th>Fonti</th><th>Note</th></tr></thead>
              <tbody>
                {[...shown].reverse().map((e) => (
                  <tr key={e.id}>
                    <td className="tnum" style={{ whiteSpace: "nowrap" }}>{fmtEventDate(e)}</td>
                    <td><span className={`badge ${e.type}`}>{TYPE_LABEL[e.type]}</span></td>
                    <td><span className="badge conf" title={CONF_LABEL[e.conf]}>{e.conf}</span></td>
                    <td>{e.sources}</td>
                    <td>
                      {e.label}
                      <small>
                        {[e.self && "autogolpe", e.colpus && `per Colpus: ${COLPUS[e.colpus] || e.colpus}`,
                          e.dup && "possibile doppione di un altro evento"].filter(Boolean).join(" · ")}
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
              <h2>Rischio stimato nel tempo</h2>
              <label className="check">Confronta con{" "}
                <select className="select" defaultValue="" onChange={(e) => compare(e.target.value)} disabled={busy}>
                  <option value="">nessun paese</option>
                  {others.map((o) => <option key={o.slug} value={o.slug}>{o.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid-2" style={{ marginTop: 8 }}>
              <div>
                <div className="legend">
                  <span><i className="ln s1" />{country.name}</span>
                  {other && <span><i className="ln s2" />{other.name}</span>}
                  <span><i className="ln" />golpe riuscito</span>
                  <span><i className="ln dash" />golpe fallito</span>
                </div>
                <LineChart series={riskSeries} markers={markers} height={240} fmt={(v) => pct(v, v < 0.1 ? 1 : 0)} />
                {other && (
                  <p className="note" style={{ marginTop: 8 }}>
                    Oggi: {country.name} {pct(country.risk)}, {other.name} {pct(other.risk)}. Tentativi dal 1900:{" "}
                    {country.attempts} contro {other.attempts}.
                  </p>
                )}
              </div>
              <div>
                <h3>Cosa spinge la stima di oggi</h3>
                <div className="legend">
                  <span><i className="sw" style={{ background: "var(--up)" }} />aumenta il rischio</span>
                  <span><i className="sw" style={{ background: "var(--down)" }} />lo riduce</span>
                </div>
                <HBars rows={country.drivers} value={(r) => r.contrib} label={(r) => r.label} diverging
                       cls={(r) => (r.contrib >= 0 ? "bar-up" : "bar-down")}
                       fmt={(r) => (r.contrib >= 0 ? "+" : "−") + dec(Math.abs(r.contrib))}
                       tipFor={(r) => (<><b>{r.label}</b>{r.contrib >= 0 ? "Aumenta" : "Riduce"} il rischio rispetto a un paese medio</>)} />
              </div>
            </div>
          </section>

          <section className="card">
            <h2>Attività mensile registrata da ACLED</h2>
            <p className="note">Le linee verticali segnano i golpe; i conteggi dipendono anche da quanto ACLED copre il paese nel tempo.</p>
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
