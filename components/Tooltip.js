"use client";

import { useCallback, useState } from "react";

/** Tooltip che segue il puntatore: const [tip, show, hide] = useTip(); <Tip tip={tip} /> */
export function useTip() {
  const [tip, setTip] = useState(null);
  const show = useCallback((evt, content) => setTip({ x: evt.clientX, y: evt.clientY, content }), []);
  const hide = useCallback(() => setTip(null), []);
  return [tip, show, hide];
}

export function Tip({ tip }) {
  if (!tip) return null;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const right = tip.x > vw - 300;
  const bottom = tip.y > vh - 140;
  const style = {
    left: right ? undefined : tip.x + 14, right: right ? vw - tip.x + 14 : undefined,
    top: bottom ? undefined : tip.y + 14, bottom: bottom ? vh - tip.y + 14 : undefined,
  };
  return <div className="tooltip" style={style} role="tooltip">{tip.content}</div>;
}
