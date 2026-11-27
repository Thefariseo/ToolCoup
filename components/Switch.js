"use client";

import { useId, useRef, useState } from "react";

/** A few readings of the same list, one at a time: tabs above, only the chosen panel in the flow. */
export default function Switch({ label, tabs }) {
  const [on, setOn] = useState(0), id = useId(), refs = useRef([]);
  const key = (e) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!d) return;
    e.preventDefault(); const n = (on + d + tabs.length) % tabs.length; setOn(n); refs.current[n]?.focus();
  };
  return (
    <div className="switch">
      <div className="switch__list" role="tablist" aria-label={label} onKeyDown={key}>
        {tabs.map((t, i) => (
          <button key={t.label} ref={(el) => (refs.current[i] = el)} type="button" role="tab" id={`${id}-t${i}`} aria-controls={`${id}-p${i}`}
            aria-selected={i === on} tabIndex={i === on ? 0 : -1} onClick={() => setOn(i)}>{t.label}</button>
        ))}
      </div>
      {tabs.map((t, i) => <div key={t.label} role="tabpanel" id={`${id}-p${i}`} aria-labelledby={`${id}-t${i}`} hidden={i !== on}>{t.panel}</div>)}
    </div>
  );
}
