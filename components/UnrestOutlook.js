import ViolenceOutlook from "@/components/ViolenceOutlook";
import { pct } from "@/lib/format";

const UNREST_TYPES = [["o", "Protests and riots"], ["b", "Peaceful protest"], ["e", "Protest with intervention"], ["v", "Riots"]];
const TARGETS = [
  ["wave", "Protest wave", "Protests and riots over the next three months averaging at least 1.5 times the last twelve months, and at least 25 a month.", "protests and riots"],
  ["escalation", "Violence escalation", "Battles, explosions and attacks on civilians over the next three months averaging at least 1.5 times the last twelve months, and at least 25 a month.", "organised violence"],
];

/** The groups of evidence that move the chance most, as two short sentences: what pushes it up and what pushes it down. */
function drivers(why) {
  const big = (why || []).filter((w) => Math.abs(w.contrib) >= 0.05);
  const up = big.filter((w) => w.contrib > 0).map((w) => w.label), down = big.filter((w) => w.contrib < 0).map((w) => w.label);
  const parts = [];
  if (up.length) parts.push(`Pushing the chance up: ${up.join("; ")}.`);
  if (down.length) parts.push(`Pushing it down: ${down.join("; ")}.`);
  return parts.join(" ") || "No single group of evidence stands out.";
}

/** The country page section for political unrest: two probabilities for the next three months, what drives them, then the protest-count outlook. */
export default function UnrestOutlook({ unrest, counts, name }) {
  if (!unrest && !counts) return null;
  return (
    <>
      {unrest && (
        <section id="unrest" className="block violence">
          <h2>Political unrest in the next three months</h2>
          <p className="note">Two chances, each defined on the monthly ACLED counts for {name}: a wave of protests and riots, and an escalation of organised violence. Both are measured against the country&rsquo;s own last twelve months, so a country with constant unrest is not flagged just for having it. Estimates come from a logistic model and a gradient-boosted model, averaged and calibrated on past forecasts; the range comes from refitting on resampled countries.</p>
          {TARGETS.map(([key, label, text, what]) => {
            const t = unrest.country[key], info = unrest.meta.targets?.[key];
            if (!t) return null;
            const base = info?.base_rate, m = info?.metrics?.since_2019;
            return (
              <div key={key}>
                <h3>{label}</h3>
                <div className="vo-kpis">
                  <div><span>Chance, next 3 months</span><b>{pct(t.p)}</b><small>range {pct(t.lo)} to {pct(t.hi)}</small></div>
                  <div><span>Versus a typical country</span><b>{base ? `${(t.p / base).toFixed(1)}x` : "–"}</b><small>{base ? `a typical country-month: ${pct(base)}` : ""}{t.rank ? `; #${t.rank} of ${Object.keys(unrest.meta.countries).length}` : ""}</small></div>
                  <div><span>{what.charAt(0).toUpperCase() + what.slice(1)} a month</span><b>{Math.round(t.last3)}</b><small>last 3 months; {Math.round(t.last12)} over the last 12</small></div>
                </div>
                <p className="note">{drivers(t.why)}{m ? ` In past forecasts since ${unrest.meta.first_test_year}, a ranking like this found ${Math.round(m.ensemble.top10_recall * 100)}% of ${label.toLowerCase()}s among the 10% of countries it ranked highest each month (a persistence rule found ${Math.round(m.persistence.top10_recall * 100)}%).` : ""}</p>
              </div>
            );
          })}
        </section>
      )}
      {counts && (
        <ViolenceOutlook country={counts.country} meta={counts.meta} admin1={counts.admin1} types={UNREST_TYPES} id="unrest-counts" what="protests and riots"
          title="Protests and riots in the next six four-week periods"
          note={`Forecast events per four-week period. The same gradient-boosted approach as the violence outlook, aimed at protests and riots: one model for all six horizons, blended with the 6-period average and the last period, with ${counts.meta.interval} intervals from a ${counts.meta.backtest_origins}-date backtest.`} />
      )}
    </>
  );
}
