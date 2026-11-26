"use client";

import Link from "next/link";
import { usePick } from "@/components/home/Pick";
import { GROUP_LABEL, ledgerModel } from "@/components/console/ledger";
import { labelEn } from "@/lib/english";
import { pct } from "@/lib/format";

const prob = (v) => pct(v, v < 0.001 ? 2 : v < 0.1 ? 1 : 0);
const mult = (d) => `×${Math.exp(d).toFixed(d >= 0 ? 1 : 2)}`;

/** "Why": the same ledger the console draws, set large. Each row moves the picked country from a reference
 *  country (the logistic model's intercept) towards its forecast, on a log-probability axis. */
export default function WhyTrace({ refP }) {
  const { selected, detail } = usePick();
  const m = detail ? ledgerModel({ groups: detail.groups, components: detail.diagnostics?.components, risk: selected.risk, lo: selected.risk_lo, hi: selected.risk_hi,
    ref: refP, peers: {}, imputed: selected.structural === false }) : null;
  const drivers = (detail?.drivers || []).slice(0, 5), most = Math.max(0.01, ...drivers.map((d) => Math.abs(d.contrib)));
  const all = m ? [m.ref, ...m.steps.flatMap((s) => [s.p0, s.p1]), m.logit, m.pub.lo, m.pub.hi].filter((p) => p > 0) : [0.001, 0.2];
  const lo = Math.log(Math.min(...all) * 0.75), hi = Math.log(Math.max(...all) * 1.3);
  const x = (p) => ((Math.log(p) - lo) / (hi - lo)) * 100;
  return (
    <>
      <div className="home-head why-head">
        <div>
          <h2 id="why-h">Why {selected.name} reads {pct(selected.risk)}</h2>
          <p>Start from a reference country, then let each group of facts push the odds up or down.</p>
        </div>
        <Link className="link" href={`/forecast?c=${selected.slug}&v=trace`} prefetch={false}>Read the full model trace</Link>
      </div>
      <div className="grid why-grid fill">
        <div className="span-5 why-drivers">
          <h3>Largest drivers of the forecast</h3>
          <ol>
            {drivers.map((d) => (
              <li key={d.label} className={d.contrib > 0 ? "up" : "down"}>
                <span>{labelEn(d.label)}</span><b>{d.contrib > 0 ? "raises" : "lowers"}</b><i style={{ width: `${(Math.abs(d.contrib) / most) * 100}%` }} />
              </li>
            ))}
            {!detail && <li className="why-wait">Reading {selected.name}…</li>}
          </ol>
          <p>These are patterns in past data that go with coups. They do not prove a cause.</p>
        </div>
        <div className="span-6 start-7 why-chart" data-ui="trace" role="img"
          aria-label={m ? `From a reference country at ${prob(m.ref)}, ${m.steps.map((s) => `${GROUP_LABEL[s.key]} ${s.d >= 0 ? "raises" : "lowers"} the odds ${mult(s.d)}`).join(", ")}; published forecast ${pct(m.pub.p)}` : `Model trace for ${selected.name}, loading`}>
          <p className="why-chart__cap"><span>Probability, log scale</span><span>odds</span></p>
          {m && (
            <ol className="why-rows">
              <li className="why-row ref"><span className="why-row__lab">Reference country</span><span className="why-row__plot"><u style={{ left: `${x(m.ref)}%` }} /></span><span className="why-row__num">{prob(m.ref)}</span></li>
              {m.steps.map((s) => (
                <li key={s.key} className={`why-row ${s.d >= 0 ? "up" : "down"}`}>
                  <span className="why-row__lab">{GROUP_LABEL[s.key]}</span>
                  <span className="why-row__plot"><i style={{ left: `${x(Math.min(s.p0, s.p1))}%`, width: `${Math.max(0.6, Math.abs(x(s.p1) - x(s.p0)))}%` }} /></span>
                  <span className="why-row__num">{mult(s.d)}</span>
                </li>
              ))}
              <li className="why-row pub">
                <span className="why-row__lab">Published forecast</span>
                <span className="why-row__plot"><em style={{ left: `${x(m.pub.lo)}%`, width: `${x(m.pub.hi) - x(m.pub.lo)}%` }} /><u style={{ left: `${x(m.pub.p)}%` }} /></span>
                <span className="why-row__num">{pct(m.pub.p)}</span>
              </li>
            </ol>
          )}
          <p className="why-chart__foot">The last step blends three models and calibrates them; the band is the 80% range.</p>
        </div>
      </div>
    </>
  );
}
