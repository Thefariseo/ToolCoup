"use client";

import Link from "next/link";
import { useState } from "react";
import CountrySearch from "@/components/CountrySearch";
import Flag from "@/components/Flag";
import Stage from "@/components/console/Stage";
import { PauseButton, PickChips, useMedia, usePick } from "@/components/home/Pick";
import { pct } from "@/lib/format";

const AWAY = { x: 0.46, y: -0.02 };

/** The hero's picture, one background layer at a time: the still drawing of this issue first, then the live signal
 *  field over it once it has drawn (the still goes; without WebGL it stays). Set to the right of the words on a wide
 *  screen; a click on a country picks it. */
export function FieldLayer() {
  const { list, selected, pick, live } = usePick();
  const [drawn, setDrawn] = useState(false);
  const wide = useMedia("(min-width: 1024px)");
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!drawn && <img className="hero__bg" src="/globe-still.svg" alt="" aria-hidden="true" fetchPriority="high" />}
      <Stage view="field" list={list} selected={selected} live={live} onSelect={pick} onReady={() => setDrawn(true)} embed bare="hero__bg field-canvas" shift={wide ? AWAY : null} fill={wide ? 1.08 : 1.02} labels={0} />
    </>
  );
}

export function HeroPause() {
  const { live, setLive, list } = usePick();
  return (
    <div className="field-pause">
      <p className="sr-only">Behind this text, a globe coloured by each country&apos;s chance of a coup attempt; {list[0].name} is highest at {pct(list[0].risk)}.</p>
      <PauseButton live={live} onToggle={() => setLive((v) => !v)} what="the globe" />
    </div>
  );
}

export function HeroPick({ options }) {
  const { selected, pick } = usePick();
  return (
    <div className="hero-pick">
      <div className="hero-pick__row">
        <CountrySearch options={options} label="Find a country" placeholder="Try Niger, Peru, Thailand" onPick={pick} />
        <Link className="btn btn--primary" href={`/forecast?c=${selected.slug}`} prefetch={false}>See the forecast</Link>
      </div>
      <PickChips count={5} />
    </div>
  );
}

/** The picked country's figures, docked to the foot of the hero. */
export function HeroFacts({ span, base }) {
  const { selected: c, list } = usePick();
  const ratio = c.risk / base;
  return (
    <dl className="hero__facts field-facts" aria-live="polite">
      <div className="field-facts__name">
        <dt>Selected on the globe</dt>
        <dd><Flag iso={c.iso} height={18} /><Link href={`/paese/${c.slug}`} prefetch={false}>{c.name}</Link></dd>
      </div>
      <div><dt>chance by {span}</dt><dd className="big">{pct(c.risk)}</dd></div>
      <div><dt>rank of {list.length}</dt><dd className="big">{c.pos}</dd></div>
      <div><dt>of a typical country</dt><dd className="big">{ratio >= 10 ? ratio.toFixed(0) : ratio.toFixed(1)}×</dd></div>
    </dl>
  );
}
