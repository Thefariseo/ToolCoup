"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import Brand from "@/components/Brand";
import CountrySearch from "@/components/CountrySearch";

// The site's navigation: a menu that drops from the top like a curtain (four slats sweep down one after another, then the sections rise into
// place), after the "page covers" recipe of Museum of Motion. A native modal <dialog>: the page behind is inert, focus stays inside, Esc closes,
// and focus returns to the button. The curtain is CSS (data-state: closed, open, closing); closing waits for the transitions to finish before
// the dialog is closed, as the top-layer guidance asks for browsers that cannot animate the exit.
export const SECTIONS = [
  ["/", "Forecast", "Coup risk for every country, six months ahead"],
  ["/registry", "Registry", "Every monthly forecast, filed first and scored later"],
  ["/violence", "Violence", "Where organised political violence is heading"],
  ["/unrest", "Unrest", "The chance of protest waves and violence escalations"],
  ["/markets", "Markets", "What prediction markets say, next to our model"],
  ["/world", "Map", "Every recorded coup since 1900"],
  ["/metodo", "Method", "How the model works and where it fails"],
];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const when = (s) => { const [y, m] = String(s).split("-"); return m ? `${MON[m - 1]} ${y}` : s; };
const isOn = (path, href) => (href === "/" ? path === "/" || path.startsWith("/paese") : path === href || path.startsWith(href + "/"));

export default function SiteMenu({ options, issue, through }) {
  const path = usePathname(), ref = useRef(null), busy = useRef(false), [state, setState] = useState("closed");
  const here = SECTIONS.find(([href]) => isOn(path, href));

  const open = useCallback((focus) => {
    const d = ref.current; if (!d || d.open) return;
    d.showModal();
    requestAnimationFrame(() => requestAnimationFrame(() => {                       // one frame at rest, so the curtain has something to move from
      setState("open");
      const target = focus === "search" ? d.querySelector(".menu-search input") : d.querySelector(".menu-list a");
      target?.focus({ preventScroll: true });
    }));
  }, []);
  const close = useCallback(async () => {
    const d = ref.current; if (!d?.open || busy.current) return;
    busy.current = true; setState("closing");
    await new Promise((r) => requestAnimationFrame(r));
    const running = d.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}));
    await Promise.race([Promise.all(running), new Promise((r) => setTimeout(r, 900))]);
    d.close(); setState("closed"); busy.current = false;
  }, []);

  useEffect(() => { if (ref.current?.open) close(); }, [path, close]);                // a click on a section: the curtain lifts as the page changes
  useEffect(() => {
    const on = (e) => { const b = e.target.closest?.("[data-open-menu]"); if (b) open(b.dataset.openMenu); };
    document.addEventListener("click", on); return () => document.removeEventListener("click", on);
  }, [open]);

  return (
    <>
      <button type="button" className="menu-btn" onClick={() => open()} aria-haspopup="dialog" aria-controls="site-menu" aria-expanded={state !== "closed"}>
        <span className="menu-lines" aria-hidden="true"><i /><i /></span>
        <span className="menu-word">Menu</span>
        {here && <span className="menu-here" aria-hidden="true">{here[1]}</span>}
      </button>
      <dialog id="site-menu" ref={ref} className="menu" data-state={state} aria-labelledby="menu-title"
        onCancel={(e) => { e.preventDefault(); close(); }} onClick={(e) => { if (e.target === e.currentTarget) close(); }}>
        <div className="menu-sheet">
          <div className="menu-slats" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="menu-bar">
            <button type="button" className="menu-btn menu-close" onClick={close}>
              <span className="menu-lines" aria-hidden="true"><i /><i /></span><span className="menu-word">Close</span>
            </button>
            <Link href="/" className="brand" aria-label="Praevex, home" onClick={close}><Brand variant="lockup" height={54} /></Link>
            <span className="menu-issue">Issue {issue}</span>
          </div>
          <h2 id="menu-title" className="sr-only">Menu</h2>
          <div className="menu-body">
            <nav aria-label="Main">
              <ol className="menu-list">
                {SECTIONS.map(([href, label, line], i) => (
                  <li key={href} style={{ "--i": i }}>
                    <Link href={href} aria-current={isOn(path, href) ? "page" : undefined} onClick={href === path ? close : undefined} data-scramble>
                      <span className="sx menu-t">{label}</span>
                      <span className="menu-d">{line}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </nav>
            <aside className="menu-side" aria-label="Find a country">
              <Brand variant="stacked" height={250} lazy className="menu-logo" />
              <div className="menu-search"><CountrySearch options={options} /></div>
              <p>Data through {when(through)}. A new issue every month.</p>
            </aside>
          </div>
        </div>
      </dialog>
    </>
  );
}
