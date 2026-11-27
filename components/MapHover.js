"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

/** Reads a server-drawn map: the shape under the pointer names itself and its figure, and a click opens the
 *  country's page. A finger gets the figure on the first tap and the page on the second. */
export default function MapHover({ children, hash = "" }) {
  const box = useRef(null), touched = useRef(null), kind = useRef("mouse"), router = useRouter();
  const [tip, setTip] = useState(null);
  const read = (e) => {
    const el = e.target.closest?.("path[data-n]"); if (!el) return null;
    const r = box.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, name: el.dataset.n, text: el.dataset.t, slug: el.dataset.slug };
  };
  return (
    <div ref={box} className={`map-hover${tip?.slug ? " go" : ""}`}
      onPointerDown={(e) => { kind.current = e.pointerType; }}
      onPointerMove={(e) => { if (e.pointerType === "mouse") setTip(read(e)); }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") setTip(null); }}
      onClick={(e) => {
        const hit = read(e);
        if (!hit) { setTip(null); touched.current = null; return; }
        const finger = kind.current !== "mouse";
        if (hit.slug && (!finger || touched.current === hit.slug)) { router.push(`/paese/${hit.slug}${hash}`); return; }
        touched.current = hit.slug; setTip(hit);
      }}>
      {children}
      {tip && (
        <div className="map-tip" style={{ left: Math.max(0, Math.min(tip.x + 14, tip.w - 200)), top: tip.y + 14 }} aria-hidden="true">
          <b>{tip.name}</b><span>{tip.text}</span>{tip.slug && <em>Open the country page</em>}
        </div>
      )}
    </div>
  );
}
