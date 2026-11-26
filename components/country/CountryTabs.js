"use client";

import { useEffect, useRef, useState } from "react";

/** A country's record in five tabs instead of one long page. Every panel is in the document; an address with a
 *  part's anchor (…#crowd from the console) opens the tab that holds it and scrolls there. */
export default function CountryTabs({ tabs }) {
  const [on, setOn] = useState(tabs[0].id), refs = useRef({}), root = useRef(null);
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.slice(1)); if (!h) return;
      const tab = tabs.find((t) => t.id === h || t.holds.includes(h)); if (!tab) return;
      setOn(tab.id);
      requestAnimationFrame(() => (tab.id === h ? root.current : document.getElementById(h))?.scrollIntoView({ block: "start" }));
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [tabs]);
  const choose = (id) => {
    setOn(id); window.history.replaceState(null, "", `#${id}`);
    const top = root.current.getBoundingClientRect().top;
    if (top < 0) root.current.scrollIntoView({ block: "start" });      // a reader far down starts the new tab at its top
  };
  const key = (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
    e.preventDefault();
    const next = tabs[(tabs.findIndex((t) => t.id === on) + d + tabs.length) % tabs.length];
    choose(next.id); refs.current[next.id]?.focus();
  };
  return (
    <div ref={root} className="ctabs">
      <div className="ctabs__bar" role="tablist" aria-label="Country record" onKeyDown={key}>
        {tabs.map((t) => (
          <button key={t.id} ref={(el) => (refs.current[t.id] = el)} type="button" role="tab" id={`tab-${t.id}`} aria-controls={`panel-${t.id}`} aria-selected={on === t.id}
            tabIndex={on === t.id ? 0 : -1} onClick={() => choose(t.id)}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" id={`panel-${t.id}`} aria-labelledby={`tab-${t.id}`} className="ctabs__panel" hidden={on !== t.id}>{t.panel}</div>
      ))}
    </div>
  );
}
