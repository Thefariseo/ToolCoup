"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

/** Ricerca paese nella testata: porta al dossier. */
export default function CountrySearch({ options }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const starts = options.filter((o) => o.name.toLowerCase().startsWith(n));
    const rest = options.filter((o) => !o.name.toLowerCase().startsWith(n) && o.name.toLowerCase().includes(n));
    return [...starts, ...rest].slice(0, 8);
  }, [q, options]);

  function go(o) {
    setQ(""); setOpen(false);
    router.push(`/paese/${o.slug}`);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) go(results[active]);
    else if (e.key === "Escape") setOpen(false);
  }
  return (
    <div className="header-search">
      <input
        className="input" type="search" placeholder="Cerca un paese" aria-label="Cerca un paese" value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)} onKeyDown={onKey}
      />
      {open && results.length > 0 && (
        <div className="search-results" role="listbox">
          {results.map((o, i) => (
            <Link key={o.slug} href={`/paese/${o.slug}`} className={i === active ? "active" : ""} role="option"
                  aria-selected={i === active} onClick={() => { setQ(""); setOpen(false); }}>
              <span>{o.name}</span><small>{o.region}</small>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
