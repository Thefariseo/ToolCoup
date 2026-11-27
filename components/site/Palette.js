"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Flag from "@/components/Flag";
import { pct } from "@/lib/format";

const PAGES = [
  { href: "/forecast", name: "Forecast console", line: "Where, when and why, for every country" },
  { href: "/world", name: "Coup history", line: "Every recorded coup since 1900, on a map" },
  { href: "/violence", name: "Violence forecast", line: "Six four-week periods ahead" },
  { href: "/unrest", name: "Unrest forecast", line: "Protest waves and escalation" },
  { href: "/markets", name: "Markets", line: "Market prices beside the model" },
  { href: "/registry", name: "Registry", line: "Filed forecasts and their scores" },
  { href: "/metodo", name: "Method", line: "Sources, model and limits" },
];

/** The search everyone can reach (button, Ctrl or ⌘ K, "/"): a country or a page, from anywhere on the site.
 *  Enter opens the country page; Shift or ⌘ Enter opens it in the console. */
export default function Palette({ options }) {
  const dlg = useRef(null), input = useRef(null), list = useRef(null);
  const [q, setQ] = useState(""), [active, setActive] = useState(0);
  const router = useRouter(), path = usePathname();
  const rows = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return [...options.filter((o) => o.pos).sort((a, b) => a.pos - b.pos).slice(0, 6).map((o) => ({ kind: "country", ...o })), ...PAGES.map((p) => ({ kind: "page", ...p }))];
    const starts = options.filter((o) => o.name.toLowerCase().startsWith(n));
    const rest = options.filter((o) => !o.name.toLowerCase().startsWith(n) && `${o.name} ${o.region}`.toLowerCase().includes(n));
    return [...[...starts, ...rest].slice(0, 10).map((o) => ({ kind: "country", ...o })), ...PAGES.filter((p) => `${p.name} ${p.line}`.toLowerCase().includes(n)).map((p) => ({ kind: "page", ...p }))];
  }, [q, options]);

  const open = () => { const d = dlg.current; if (!d || d.open) return; setQ(""); setActive(0); d.showModal(); input.current?.focus(); };
  const close = () => dlg.current?.open && dlg.current.close();
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); dlg.current?.open ? close() : open(); }
      else if (e.key === "/" && !typing && path !== "/forecast") { e.preventDefault(); open(); }
    };
    const onOpen = () => open();
    window.addEventListener("keydown", onKey); window.addEventListener("praevex:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("praevex:search", onOpen); };
  }, [path]);
  useEffect(() => { close(); }, [path]);
  useEffect(() => { list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [active]);

  function go(r, consoleToo) {
    if (!r) return;
    close();
    router.push(r.kind === "page" ? r.href : consoleToo ? `/forecast?c=${r.slug}` : `/paese/${r.slug}`);
  }
  function onKey(e) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, rows.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); go(rows[active], e.shiftKey || e.metaKey || e.ctrlKey); }
  }
  const countries = rows.filter((r) => r.kind === "country"), pages = rows.filter((r) => r.kind === "page");
  const item = (r, i) => (
    <li key={r.slug || r.href} id={`pal-${i}`} role="option" aria-selected={i === active} onMouseMove={() => i !== active && setActive(i)} onClick={(e) => go(r, e.shiftKey || e.metaKey || e.ctrlKey)}>
      {r.kind === "country" ? (
        <><Flag iso={r.iso} height={14} /><span className="pal__name">{r.name}</span><span className="pal__meta">{r.region}</span><span className="pal__fig">{r.risk == null ? "archive" : pct(r.risk)}</span></>
      ) : (<><span className="pal__name">{r.name}</span><span className="pal__meta">{r.line}</span></>)}
    </li>
  );
  return (
    <dialog ref={dlg} className="pal" aria-label="Search countries and pages" onClick={(e) => e.target === dlg.current && close()}>
      <div className="pal__box">
        <div className="pal__top">
          <label className="pal__label" htmlFor="pal-input">Search countries and pages</label>
          <input id="pal-input" ref={input} className="pal__input" type="search" autoComplete="off" placeholder="A country, a region or a page" role="combobox" aria-expanded="true" aria-controls="pal-list"
            aria-activedescendant={rows[active] ? `pal-${active}` : undefined} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
          <button type="button" className="pal__close" onClick={close} aria-label="Close search">Esc</button>
        </div>
        <div className="pal__list" id="pal-list" ref={list} role="listbox" aria-label="Results">
          {countries.length > 0 && <><p className="pal__head">{q.trim() ? "Countries" : "Highest chance now"}</p><ul role="presentation">{countries.map((r) => item(r, rows.indexOf(r)))}</ul></>}
          {pages.length > 0 && <><p className="pal__head">Pages</p><ul role="presentation">{pages.map((r) => item(r, rows.indexOf(r)))}</ul></>}
          {!rows.length && <p className="pal__none">Nothing matches “{q.trim()}”.</p>}
        </div>
        <p className="pal__foot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>Enter</kbd> country page</span><span><kbd>Shift</kbd><kbd>Enter</kbd> console</span></p>
      </div>
    </dialog>
  );
}
