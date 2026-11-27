"use client";

import { useEffect, useState } from "react";
import { fmtClose, marketVerdict, money, pct } from "@/lib/format";

const p1 = (v) => pct(v, v != null && v < 0.1 ? 1 : 0);

/** One line under the header figures: what the leading prediction market prices, next to our model at the same horizon. Renders nothing when the country has no market. */
export default function MarketFact({ slug }) {
  const [m, setM] = useState(null);
  useEffect(() => {
    let on = true;
    fetch(`/api/markets/${slug}`).then((r) => (r.ok ? r.json() : null)).then((d) => on && setM(d?.primary || null)).catch(() => {});
    return () => { on = false; };
  }, [slug]);
  if (!m) return null;
  const v = marketVerdict(m.p, m.model);
  return (
    <p className="market-line">
      <b>{p1(m.p)}</b>
      <span>
        {m.source} prices this to {fmtClose(m.closes)}, with {money(m.volume)} traded
        {m.model != null && `; our model at the same horizon: ${p1(m.model)}`}.{v ? ` ${v.text}` : ""} <a href="#crowd">Market check</a>
      </span>
    </p>
  );
}
