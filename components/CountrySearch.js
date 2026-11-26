"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

/** A country combobox. It goes to the country page, or hands the choice to `onPick` (the home globe). */
export default function CountrySearch({ options, label = "Country name", placeholder = "Type a name", onPick }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const router = useRouter(), path = usePathname(), id = useId();
  const results = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [];
    const starts = options.filter((o) => o.name.toLowerCase().startsWith(n));
    const rest = options.filter((o) => !o.name.toLowerCase().startsWith(n) && o.name.toLowerCase().includes(n));
    return [...starts, ...rest].slice(0, 8);
  }, [q, options]);
  const shown = open && q.trim().length > 0;

  function go(o) {
    setQ(""); setOpen(false);
    if (onPick) onPick(o.slug);
    else if (path !== `/paese/${o.slug}`) router.push(`/paese/${o.slug}`);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter" && results[active]) { e.preventDefault(); go(results[active]); }
    else if (e.key === "Escape" && shown) { e.stopPropagation(); setOpen(false); }
  }
  return (
    <div className="cs" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
      <label className="cs-label" htmlFor={`${id}-input`}>{label}</label>
      <input
        id={`${id}-input`} className="cs-input" type="search" placeholder={placeholder} autoComplete="off"
        role="combobox" aria-expanded={shown} aria-controls={`${id}-list`} aria-autocomplete="list"
        aria-activedescendant={shown && results[active] ? `${id}-${results[active].slug}` : undefined}
        value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
      />
      {shown && (
        <ul className="cs-results" id={`${id}-list`} role="listbox" aria-label="Countries">
          {results.map((o, i) => (
            <li key={o.slug} id={`${id}-${o.slug}`} role="option" aria-selected={i === active}>
              <Link href={`/paese/${o.slug}`} tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={(e) => { e.preventDefault(); go(o); }}>
                <span>{o.name}</span><small>{o.region}</small>
              </Link>
            </li>
          ))}
          {!results.length && <li className="cs-none" role="option" aria-selected="false">No country matches “{q.trim()}”.</li>}
        </ul>
      )}
    </div>
  );
}
