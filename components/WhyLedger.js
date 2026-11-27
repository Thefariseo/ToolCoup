"use client";

import { useEffect, useState } from "react";
import { GROUP_LABEL, ledgerModel } from "@/components/console/ledger";
import { labelEn } from "@/lib/english";
import { pct } from "@/lib/format";

const prob = (v) => pct(v, v < 0.001 ? 2 : v < 0.1 ? 1 : 0);
const mult = (d) => `×${Math.exp(d).toFixed(d >= 0 ? 1 : 2)}`;
// what each group of variables holds, in plain words
const HOLDS = {
  storia: "How long since the last attempt, and how many came before it.",
  contagio: "Recent attempts in the region and around the world.",
  regime: "The kind of regime, the army's weight in government and the limits on the executive.",
  leader: "How long the leader has held office, recent handovers and elections.",
  economia: "Income, growth, infant mortality and oil rents.",
  piazza: "Yearly measures of protest and political violence.",
  acled: "Monthly unrest, violence, repression and infighting in state forces, against the country's own baseline.",
};

/** The model's ledger for one country, set large (the home page and the country page). Each row moves it from a
 *  reference country (the logistic model's intercept) towards its forecast on a log-probability axis; choosing a
 *  row names what is in it. `country`: {slug, name, risk, risk_lo, risk_hi, structural}; `detail` may still be loading. */
export default function WhyLedger({ country, detail, refP, featureGroup }) {
  const [choice, setChoice] = useState(null);
  useEffect(() => { setChoice(null); }, [country.slug]);                       // a new country opens on its largest push
  const m = detail ? ledgerModel({ groups: detail.groups, components: detail.diagnostics?.components, risk: country.risk, lo: country.risk_lo, hi: country.risk_hi,
    ref: refP, peers: {}, imputed: country.structural === false }) : null;
  const all = m ? [m.ref, ...m.steps.flatMap((s) => [s.p0, s.p1]), m.logit, m.pub.lo, m.pub.hi].filter((p) => p > 0) : [0.001, 0.2];
  const lo = Math.log(Math.min(...all) * 0.75), hi = Math.log(Math.max(...all) * 1.3);
  // rounded: the server's and the browser's styles must read the same
  const x = (p) => Math.round(((Math.log(p) - lo) / (hi - lo)) * 10000) / 100;
  const step = m?.steps.find((s) => s.key === choice) || m?.steps[0];
  const inside = step ? (detail?.drivers || []).filter((d) => featureGroup?.[d.label] === step.key) : [];
  const most = Math.max(0.01, ...(detail?.drivers || []).map((d) => Math.abs(d.contrib)));
  return (
    <div className="grid why-grid fill">
      <div className="span-6 why-chart" data-ui="trace">
        <p className="why-chart__cap"><span>Probability, log scale</span><span>odds</span></p>
        {m ? (
          <ol className="why-rows">
            <li className="why-row ref"><span className="why-row__lab">Reference country</span><span className="why-row__plot" aria-hidden="true"><u style={{ left: `${x(m.ref)}%` }} /></span><span className="why-row__num">{prob(m.ref)}</span></li>
            {m.steps.map((s) => (
              <li key={s.key} className={`why-item ${s.d >= 0 ? "up" : "down"}${s.key === step?.key ? " on" : ""}`}>
                <button type="button" className="why-row" aria-pressed={s.key === step?.key} onClick={() => setChoice(s.key)} onPointerEnter={(e) => { if (e.pointerType === "mouse") setChoice(s.key); }}>
                  <span className="why-row__lab">{GROUP_LABEL[s.key]}</span>
                  <span className="why-row__plot" aria-hidden="true"><i style={{ left: `${x(Math.min(s.p0, s.p1))}%`, width: `${Math.max(0.6, Math.abs(x(s.p1) - x(s.p0))).toFixed(2)}%` }} /></span>
                  <span className="why-row__num"><span className="sr-only">{s.d >= 0 ? "raises the odds " : "lowers the odds "}</span>{mult(s.d)}</span>
                </button>
              </li>
            ))}
            <li className="why-row pub">
              <span className="why-row__lab">Published forecast</span>
              <span className="why-row__plot" aria-hidden="true"><em style={{ left: `${x(m.pub.lo)}%`, width: `${(x(m.pub.hi) - x(m.pub.lo)).toFixed(2)}%` }} /><u style={{ left: `${x(m.pub.p)}%` }} /></span>
              <span className="why-row__num">{pct(m.pub.p)}</span>
            </li>
          </ol>
        ) : <p className="why-wait">{detail ? "No driver breakdown is published for this country." : `Reading ${country.name}…`}</p>}
        <p className="why-chart__foot">The last step blends three models and calibrates them; the band is the 80% range.</p>
      </div>
      <div className="span-6 start-7 why-side" aria-live="polite">
        {step && (
          <>
            <p className={`why-side__odds ${step.d >= 0 ? "up" : "down"}`}><b>{mult(step.d)}</b><span>{step.d >= 0 ? "raises the odds" : "lowers the odds"}</span></p>
            <p className="why-side__name">{GROUP_LABEL[step.key]}</p>
            <p className="why-side__holds">{HOLDS[step.key]}</p>
            {inside.length > 0 ? (
              <ol className="why-vars">
                {inside.slice(0, 4).map((d) => (
                  <li key={d.label} className={d.contrib > 0 ? "up" : "down"}>
                    <span>{labelEn(d.label)}</span><b>{d.contrib > 0 ? "raises" : "lowers"}</b><i style={{ width: `${((Math.abs(d.contrib) / most) * 100).toFixed(2)}%` }} />
                  </li>
                ))}
              </ol>
            ) : <p className="why-side__none">None of {country.name}&apos;s six largest variables sits in this group.</p>}
            <p className="why-side__note">Patterns in past data that go with coups. They do not prove a cause.</p>
          </>
        )}
      </div>
    </div>
  );
}
