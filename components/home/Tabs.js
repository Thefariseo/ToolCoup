"use client";

import { useId, useRef, useState } from "react";

/** Click tabs over panels stacked in one place: choosing one never changes the section's height. */
export default function Tabs({ label, tabs }) {
  const [on, setOn] = useState(0), id = useId(), refs = useRef([]);
  const key = (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = (on + d + tabs.length) % tabs.length; setOn(n); refs.current[n]?.focus();
  };
  return (
    <div className="seg-tabs fill">
      <div className="seg-tabs__list" role="tablist" aria-label={label} onKeyDown={key}>
        {tabs.map((t, i) => (
          <button key={t.label} ref={(el) => (refs.current[i] = el)} type="button" role="tab" id={`${id}-t${i}`} aria-controls={`${id}-p${i}`}
            aria-selected={i === on} tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="seg-tabs__stack">
        {tabs.map((t, i) => (
          <div key={t.label} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} className="seg-tabs__panel" data-on={i === on ? "" : undefined} inert={i !== on}>
            {t.panel}
          </div>
        ))}
      </div>
    </div>
  );
}
