"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import Stage from "@/components/console/Stage";
import { PauseButton, useMedia, useMotion, usePick } from "@/components/home/Pick";

let atlasPromise;
const loadAtlas = () => (atlasPromise ||= fetch("/api/atlas").then((r) => (r.ok ? r.json() : Promise.reject(new Error("atlas")))).catch((e) => { atlasPromise = null; throw e; }));

/** "When": the temporal atlas at full size, the picked country's ridge lit. The data and the drawing start only
 *  when the section comes near the screen; the still drawing stands in until then. */
export default function WhenAtlas({ still }) {
  const { list, selected, detail, pick } = usePick();
  const [atlas, setAtlas] = useState(null), [live, setLive] = useMotion();
  const box = useRef(null);
  const phone = useMedia("(max-width: 639px)");
  useEffect(() => {
    const el = box.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { io.disconnect(); loadAtlas().then(setAtlas).catch(() => {}); } }, { rootMargin: "100% 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={box} className="when-win fill" data-visual data-ui="atlas" role="group" aria-label={`Forecast history of every country since 1975, with ${selected.name} lit`}>
      {still}
      {atlas && <Stage view="atlas" list={list} selected={selected} detail={detail} atlas={atlas} live={live} onSelect={pick} embed />}
      <div className="when-win__bar">
        <span>{phone ? "Tap a ridge" : "Hover a ridge for its figures, click to light it"}</span>
        <Link className="when-win__open" href={`/forecast?c=${selected.slug}&v=atlas`} prefetch={false}>Open in the console</Link>
      </div>
      <PauseButton live={live} onToggle={() => setLive((v) => !v)} what="the atlas" />
    </div>
  );
}
