const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ym = (s) => (s ? `${MON[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}` : "");
const num = (v, d = 1) => (v == null ? "–" : Number(v).toLocaleString("en-GB", { maximumFractionDigits: d }));
const sgn = (v, d = 1) => (v == null ? "–" : `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(d)}`);

function sections(s) {
  const out = [];
  const reg = [];
  const live = (s.suspensions || []).filter((x) => !x.end), past = (s.suspensions || []).filter((x) => x.end);
  if (live.length) reg.push({ label: "AU / ECOWAS standing", value: "Suspended", tone: "hot", sub: live.map((x) => `${x.body} since ${ym(x.start)}`).join("; ") });
  else if (past.length) reg.push({ label: "AU / ECOWAS standing", value: "Past suspension", sub: past.slice(0, 2).map((x) => `${x.body} ${ym(x.start)} – ${ym(x.end)}`).join("; ") });
  if (s.un_sanctions) reg.push({ label: "UN Security Council sanctions", value: `${s.un_sanctions.listed} listed`, sub: `${s.un_sanctions.regime} regime, listings ${ym(s.un_sanctions.first)}${s.un_sanctions.last !== s.un_sanctions.first ? ` to ${ym(s.un_sanctions.last)}` : ""} (current list only)` });
  if (s.un_mission) {
    const m = s.un_mission;
    reg.push(m.personnel > 0
      ? { label: "UN peacekeeping personnel", value: num(m.personnel, 0), tone: m.twelve_months_earlier > 0 && m.personnel < m.twelve_months_earlier * 0.8 ? "down" : "", sub: `${ym(m.month)}${m.twelve_months_earlier ? `; ${sgn(((m.personnel / m.twelve_months_earlier) - 1) * 100, 0)}% on a year earlier (${num(m.twelve_months_earlier, 0)})` : ""}` }
      : { label: "UN peacekeeping personnel", value: "None now", sub: `peak ${num(m.peak, 0)} in ${ym(m.peak_month)}; last present ${ym(m.ended)}` });
  }
  if (reg.length) out.push(["Regional and international standing", reg]);

  const sec = [];
  if (s.military_spending_gdp) sec.push({ label: "Military spending", value: `${num(s.military_spending_gdp.value)}% of GDP`, sub: `SIPRI via World Bank, ${s.military_spending_gdp.year}` });
  if (s.armed_forces_per_1000) sec.push({ label: "Armed forces", value: `${num(s.armed_forces_per_1000.value)} per 1,000`, sub: `${num(s.armed_forces_per_1000.total, 0)} personnel, ${s.armed_forces_per_1000.year}` });
  if (s.arms_imports) sec.push({ label: "Arms imports", value: `$${num(s.arms_imports.value, 0)}M`, sub: `SIPRI trend indicator, ${s.arms_imports.year}` });
  if (sec.length) out.push(["Armed forces", sec]);

  const eco = [];
  if (s.reserves_months) eco.push({ label: "Reserves", value: `${num(s.reserves_months.value)} months`, tone: s.reserves_months.value < 3 ? "hot" : "", sub: `of imports, ${s.reserves_months.year}` });
  if (s.debt_service_exports) eco.push({ label: "External debt service", value: `${num(s.debt_service_exports.value)}%`, sub: `of exports, ${s.debt_service_exports.year}` });
  if (s.current_account_gdp) eco.push({ label: "Current account", value: `${sgn(s.current_account_gdp.value)}%`, sub: `of GDP, ${s.current_account_gdp.year}` });
  if (s.govt_debt_gdp) eco.push({ label: "Government debt", value: `${num(s.govt_debt_gdp.value, 0)}%`, sub: `of GDP, ${s.govt_debt_gdp.year}` });
  if (s.prices?.cpi_yoy != null) eco.push({ label: "Consumer prices", value: `${sgn(s.prices.cpi_yoy)}% y/y`, tone: s.prices.cpi_yoy > 15 ? "hot" : "", sub: `${s.prices.food_cpi_yoy != null ? `food ${sgn(s.prices.food_cpi_yoy)}%, ` : ""}${ym(s.prices.month)}, FAOSTAT` });
  if (s.currency) eco.push({ label: "Local currency per US$", value: `${sgn(s.currency.change_12m_pct)}%`, tone: s.currency.change_12m_pct > 20 ? "hot" : "", sub: `12-month change (plus = weaker), ${ym(s.currency.month)}` });
  if (eco.length) out.push(["Economic stress", eco]);

  const soc = [];
  if (s.leaders?.head_of_state) soc.push({ label: "Head of state", value: s.leaders.head_of_state, small: true, sub: s.leaders.head_of_state_age != null ? `age ${s.leaders.head_of_state_age}, Wikidata` : "Wikidata" });
  if (s.leaders?.head_of_government && s.leaders.head_of_government !== s.leaders.head_of_state) soc.push({ label: "Head of government", value: s.leaders.head_of_government, small: true, sub: s.leaders.head_of_government_age != null ? `age ${s.leaders.head_of_government_age}, Wikidata` : "Wikidata" });
  if (s.ethnic_power) soc.push({ label: "Ethnic exclusion from power", value: `${num(s.ethnic_power.excluded_share * 100, 0)}% of people`, sub: `${s.ethnic_power.excluded_groups} of ${s.ethnic_power.groups} groups, ETH Zurich EPR ${s.ethnic_power.year}` });
  if (s.term_limit_evasion) soc.push({ label: "Term-limit evasion attempts", value: String(s.term_limit_evasion.years.length), sub: `${s.term_limit_evasion.years.join(", ")} (data ends ${s.term_limit_evasion.coverage_ends})` });
  if (soc.length) out.push(["Leadership and society", soc]);

  if (s.news) out.push(["The news", [
    { label: "News tone", value: sgn(s.news.tone, 1), tone: s.news.tone_z <= -2 ? "hot" : "", sub: `${s.news.tone_z >= 0 ? "above" : "below"} its own usual by ${Math.abs(s.news.tone_z).toFixed(1)} standard deviations, ${ym(s.news.month)}` },
    { label: "Conflict share of news events", value: `${num(s.news.conflict_share * 100, 0)}%`, tone: s.news.conflict_z >= 2 ? "hot" : "", sub: `${s.news.conflict_z >= 0 ? "above" : "below"} usual by ${Math.abs(s.news.conflict_z).toFixed(1)} sd; GDELT, about four sampled days a month` },
  ]]);
  return out;
}

/** International standing and structural context: descriptive facts from open sources, shown beside (not inside) the forecast. */
export default function StandingView({ standing, name }) {
  if (!standing) return null;
  const groups = sections(standing);
  if (!groups.length) return null;
  return (
    <section id="standing" className="card standing">
<h2>International standing and context for {name}</h2>
      <p className="note">Facts from open sources, each with the date of its latest value. They describe the country. We test separately whether each one improves the forecast, and the model uses only those that do (see Method). Values older than eight years are left out.</p>
      {groups.map(([title, items]) => (
        <div key={title} className="st-group">
          <h3>{title}</h3>
          <div className="km-grid">
            {items.map((m) => <div key={m.label} className={`km-tile ${m.tone || ""}`}><span>{m.label}</span><b className={m.small ? "sm" : ""}>{m.value}</b><small>{m.sub}</small></div>)}
          </div>
        </div>
      ))}
    </section>
  );
}
