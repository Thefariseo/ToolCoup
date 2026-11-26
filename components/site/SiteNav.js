"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Brand from "@/components/Brand";
import Palette from "@/components/site/Palette";

// The header, on the design kit's classes (assets/system.css): fixed, opaque, the logo in the middle. The product's
// views sit on the left, the record on the right, then the search and the one button. Under 1024px the words move
// into a full-screen sheet behind the menu button; the search stays in the bar.
const LEFT = [["/world", "Map"], ["/violence", "Violence"], ["/unrest", "Unrest"], ["/markets", "Markets"]];
const RIGHT = [["/registry", "Registry"], ["/metodo", "Method"]];
// the map carries a detailed world outline (about 800 KB of script): it loads when someone asks for it, not ahead

export default function SiteNav({ options }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const here = (href) => path === href || path.startsWith(`${href}/`);

  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => { document.body.classList.toggle("nav-locked", open); return () => document.body.classList.remove("nav-locked"); }, [open]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && open) { setOpen(false); document.querySelector(".nav__toggle")?.focus(); } };
    const wide = window.matchMedia("(min-width: 1024px)"), onWide = (e) => e.matches && setOpen(false);
    document.addEventListener("keydown", onKey); wide.addEventListener("change", onWide);
    return () => { document.removeEventListener("keydown", onKey); wide.removeEventListener("change", onWide); };
  }, [open]);

  const word = ([href, label], cls = "") => (
    <div key={href} className={`nav__item ${cls}`}><Link className="nav__link" href={href} prefetch={href === "/world" ? false : undefined} aria-current={here(href) ? "page" : undefined} onClick={() => setOpen(false)}>{label}</Link></div>
  );
  return (
    <>
      <header className={`nav nav--split${open ? " is-open" : ""}`}>
        <div className="wrap nav__bar">
          <a className="skip-link" href="#top">Skip to content</a>
          <Link className="nav__logo" href="/" aria-label="Praevex, home"><Brand variant="lockup" height={40} /></Link>
          <nav className="nav__links" aria-label="Main" id="site-menu">
            {LEFT.map((l) => word(l))}
            {RIGHT.map((l) => word(l, "nav__sheet-only"))}
          </nav>
          <div className="nav__actions">
            <nav className="nav__more" aria-label="Record">{RIGHT.map((l) => word(l))}</nav>
            <button type="button" className="nav__search" onClick={() => window.dispatchEvent(new Event("praevex:search"))} aria-label="Search countries and pages" aria-keyshortcuts="Meta+K Control+K">
              <svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5 14 14" /></svg>
              <span>Search</span><kbd>⌘K</kbd>
            </button>
            {path !== "/forecast" && <Link className="btn btn--primary" href="/forecast" onClick={() => setOpen(false)}>See the forecast</Link>}
          </div>
          <button className="nav__toggle" type="button" aria-expanded={open} aria-controls="site-menu" aria-label="Menu" onClick={() => setOpen((v) => !v)}>
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d={open ? "M4 4l10 10M14 4L4 14" : "M2 5h14M2 13h14"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>
      <Palette options={options} />
    </>
  );
}
