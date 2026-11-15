"use client";

import { useEffect, useRef, useState } from "react";
import { pct } from "@/lib/format";

// A number that runs from its last value to the new one (Museum of Motion's counter recipe, without GSAP). Used where the
// figure changes because the reader chose something else, so the eye sees that it changed. Reduced motion jumps straight there.
export default function CountUp({ value, format, fmt, start, duration = 520 }) {
  // `fmt="pct"` lets a server component ask for a percentage without passing a function; `start` makes the first render count up from there.
  const f = format || (fmt === "pct" ? (v) => pct(v) : String);
  const [shown, setShown] = useState(start ?? value), from = useRef(start ?? value);
  useEffect(() => {
    if (value == null || from.current == null || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { from.current = value; setShown(value); return; }
    const a = from.current, b = value, t0 = performance.now(); let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / duration), e = 1 - Math.pow(1 - k, 3);
      from.current = a + (b - a) * e; setShown(from.current);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <>{shown == null ? "–" : f(shown)}</>;
}
