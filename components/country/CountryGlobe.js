"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import Stage from "@/components/console/Stage";
import { PauseButton, useMotion } from "@/components/home/Pick";
import { pct } from "@/lib/format";

/** The signal field turned to this country, with a pin on it. A click on another country opens its page. */
export default function CountryGlobe({ list, slug, still }) {
  const [live, setLive] = useMotion();
  const [drawn, setDrawn] = useState(false);
  const pin = useRef(null);
  const router = useRouter();
  const selected = useMemo(() => list.find((c) => c.slug === slug) || null, [list, slug]);
  const pick = useCallback((s) => { if (s !== slug) router.push(`/paese/${s}`); }, [router, slug]);
  return (
    <div className="country-globe" data-visual role="group" aria-label={`The signal field turned to ${selected?.name}`}>
      {!drawn && still}
      <Stage view="field" list={list} selected={selected} live={live} onSelect={pick} embed fill={1.12} labels={0} pin={pin} onReady={() => setDrawn(true)} />
      <div ref={pin} className="globe-pin" aria-hidden="true"><i /><span>{selected?.name}<b>{pct(selected?.risk)}</b></span></div>
      <PauseButton live={live} onToggle={() => setLive((v) => !v)} what="the globe" />
    </div>
  );
}
