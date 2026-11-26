"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TAG = { news: "News", model: "Model", violence: "Violence", market: "Markets", registry: "Registry" };
const ago = (iso) => { const h = (Date.now() - Date.parse(iso)) / 36e5; return h < 1 ? "just now" : h < 24 ? `${Math.floor(h)} h ago` : `${Math.floor(h / 24)} d ago`; };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

function Item({ it, copy }) {
  const tab = copy ? -1 : undefined;                              // the second copy exists only to make the loop seamless
  return (
    <span className={`tk-item tk-${it.k}`}>
      <b className="tk-k">{TAG[it.k]}</b>
      {it.ext ? <a href={it.href} target="_blank" rel="noopener noreferrer" tabIndex={tab}>{it.text}</a> : <Link href={it.href} tabIndex={tab} prefetch={false}>{it.text}</Link>}
      {it.src && <small className="tk-meta" suppressHydrationWarning>{it.src}, {ago(it.t)}</small>}
      {it.name && it.risk != null && <Link className="tk-chip" href={`/paese/${it.slug}`} tabIndex={tab} prefetch={false}>{it.name} {pct(it.risk)}</Link>}
    </span>
  );
}

/** One thin line at the foot of the data pages: vetted-outlet headlines on coups next to lines from our own data.
 *  Pauses on hover, focus or the button. The home page leaves it out: there, one screen shows one thing. */
export default function Ticker({ initial = [] }) {
  const path = usePathname(), off = path === "/";
  const [items, setItems] = useState(initial);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (off) return;
    let alive = true;
    const load = () => fetch("/api/ticker").then((r) => (r.ok ? r.json() : null)).then((d) => { if (alive && d?.items?.length) setItems(d.items); }).catch(() => {});
    load();
    const id = setInterval(load, 10 * 60 * 1000);
    return () => { alive = false; clearInterval(id); };
  }, [off]);
  if (off || !items.length) return null;
  return (
    <aside className={`ticker${paused ? " paused" : ""}`} aria-label="Latest coup headlines and model updates">
      <div className="ticker-label"><span>Latest</span></div>
      <div className="ticker-view">
        <div className="ticker-track" style={{ "--tk-dur": `${Math.max(80, items.length * 9)}s` }}>
          <span className="tk-half">{items.map((it, i) => <Item key={i} it={it} />)}</span>
          <span className="tk-half" aria-hidden="true">{items.map((it, i) => <Item key={i} it={it} copy />)}</span>
        </div>
      </div>
      <button type="button" className="ticker-pause" aria-pressed={paused} aria-label={paused ? "Resume the news line" : "Pause the news line"} onClick={() => setPaused((p) => !p)}>
        <i className={paused ? "play" : "bars"} aria-hidden="true" />
      </button>
    </aside>
  );
}
