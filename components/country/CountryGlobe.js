"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";
import Stage from "@/components/console/Stage";
import { PauseButton, useMotion } from "@/components/home/Pick";

/** The signal field turned to this country. A click on another country opens its page. */
export default function CountryGlobe({ list, slug, still }) {
  const [live, setLive] = useMotion();
  const router = useRouter();
  const selected = useMemo(() => list.find((c) => c.slug === slug) || null, [list, slug]);
  const pick = useCallback((s) => { if (s !== slug) router.push(`/paese/${s}`); }, [router, slug]);
  return (
    <div className="country-globe" data-visual role="group" aria-label={`The signal field turned to ${selected?.name}`}>
      {still}
      <Stage view="field" list={list} selected={selected} live={live} onSelect={pick} embed fill={1.12} labels={4} />
      <PauseButton live={live} onToggle={() => setLive((v) => !v)} what="the globe" />
    </div>
  );
}
