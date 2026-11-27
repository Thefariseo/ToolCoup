"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import CountrySearch from "@/components/CountrySearch";
import Flag from "@/components/Flag";
import Stage from "@/components/console/Stage";
import { PauseButton, useMedia, usePick } from "@/components/home/Pick";
import { change, ordinal, pct, points, times } from "@/lib/format";

// where the globe sits beside the words: further right, and a little smaller, on a narrower desktop
const AWAY = { x: 0.46, y: -0.02 }, NEAR = { x: 0.6, y: -0.02 };

/** The hero's picture, one background layer at a time: the still drawing of this issue first, then the live signal
 *  field over it once it has drawn (the still goes; without WebGL it stays). Set to the right of the words on a wide
 *  screen; a click on a country picks it, and a pin follows the picked one as the globe turns. */
export function FieldLayer() {
  const { list, selected, pick, live } = usePick();
  const [drawn, setDrawn] = useState(false);
  const pin = useRef(null);
  const wide = useMedia("(min-width: 1024px)"), roomy = useMedia("(min-width: 1280px)");
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {!drawn && <img className="hero__bg" src="/globe-still.svg" alt="" aria-hidden="true" fetchPriority="high" />}
      <Stage view="field" list={list} selected={selected} live={live} onSelect={pick} onReady={() => setDrawn(true)} embed bare="hero__bg field-canvas" shift={wide ? (roomy ? AWAY : NEAR) : null} fill={wide ? (roomy ? 1.08 : 0.96) : 1.02} labels={0} pin={pin} />
      <div ref={pin} className="globe-pin" aria-hidden="true"><i /><span>{selected.name}<b>{pct(selected.risk)}</b></span></div>
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

/** Search, then this month's highest chances: either one picks a country on the globe. */
export function HeroPick({ options, span }) {
  const { list, selected, pick } = usePick();
  const top = list.slice(0, 5);
  const rows = top.some((c) => c.slug === selected.slug) ? top : [...top.slice(0, 4), selected];
  return (
    <div className="hero-pick">
      <CountrySearch options={options} label="Find a country" placeholder="Try Niger, Peru, Thailand" onPick={pick} />
      <div className="top-list">
        <p className="top-list__head"><span>Highest chance by {span}</span><span>3 months, pts</span></p>
        <ol>
          {rows.map((c) => {
            const d = change(c);
            return (
              <li key={c.slug} className={c.slug === selected.slug ? "on" : undefined}>
                <button type="button" aria-pressed={c.slug === selected.slug} onClick={() => pick(c.slug)}>
                  <span className="top-list__pos">{c.pos}</span><Flag iso={c.iso} height={12} eager /><span className="top-list__name">{c.name}</span>
                  <span className="top-list__bar" aria-hidden="true"><i style={{ width: `${Math.sqrt(c.risk / list[0].risk) * 100}%` }} /></span>
                  <b>{pct(c.risk)}</b><small className={Math.abs(d) < 0.0005 ? undefined : d > 0 ? "up" : "down"}>{points(d)}</small>
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

export function HeroActions() {
  const { selected } = usePick();
  return (
    <div className="hero-actions">
      <Link className="btn btn--primary" href={`/forecast?c=${selected.slug}`} prefetch={false}>See the forecast</Link>
      <Link className="hero-actions__more" href="/registry" prefetch={false}>How past forecasts scored</Link>
    </div>
  );
}

/** The picked country in figures, docked beside the globe. */
export function HeroCard({ span, base }) {
  const { selected: c, list } = usePick();
  const d = change(c);
  return (
    <aside className="hero-card" aria-live="polite" aria-label="Selected country">
      <p className="hero-card__name"><Flag iso={c.iso} height={16} eager />{c.name}<b>{pct(c.risk)}</b></p>
      <p className="hero-card__p"><b>{pct(c.risk)}</b><span>chance of a coup attempt by {span}</span></p>
      <dl>
        <div><dt>Rank</dt><dd>{ordinal(c.pos)}<small> of {list.length}</small></dd></div>
        <div><dt>Typical country</dt><dd>{times(c.risk / base)}</dd></div>
        <div><dt>3 months</dt><dd className={Math.abs(d) < 0.0005 ? undefined : d > 0 ? "up" : "down"}>{points(d)}<small> pts</small></dd></div>
      </dl>
      <Link className="hero-card__open" href={`/paese/${c.slug}`} prefetch={false} aria-label={`Open the country page for ${c.name}`}>
        <span className="long">Open the country page</span><span className="short">Details</span><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1 6h9M6.5 2.5 10 6l-3.5 3.5" /></svg>
      </Link>
    </aside>
  );
}
