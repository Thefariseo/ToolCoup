# Console

Lives at `/forecast` (old `/?c=…&v=…` links redirect there). One moving field fills the screen; four panels float
over it, and every view is drawn in the part they leave free.

| Panel | Job |
|---|---|
| Watchlist (left) | Every forecast country with its flag, three-month change and 6-month chance. Sort by chance, rise or name; filter with `/`, move with `↑ ↓`. |
| View bar (top) | Where, when, why (keys `1 2 3`), flat map (`G`), pause (`M`), timeline (`T`), guide (`?`). |
| Timeline (bottom) | The selected country since 1975: published monthly risk, recorded coups, ACLED counts. |
| Readout (right) | The number, how it compares with a typical country, its 80% range, change, coup record, the largest drivers and the brief. |

Under 1100px the panels stack below the stage. A first visit is offered the guide in a corner; it never opens by
itself (except with `?tour=1`).

The panels' measured size is handed to the engine as margins (`engine.setInset`), so the globe, the atlas and the
ledger are centred in the free rectangle at any width. `setShift` moves the globe off centre and `setFill` scales it.

## The same stage elsewhere

`components/console/Stage.js` also draws inside pages (`embed`): no zoom buttons, no wheel capture. On the home page
the hero uses `bare`, which returns the canvas alone as the section's background layer, over `/globe-still.svg`; the
"when" section shows the atlas; a country page shows the globe turned to that country. When WebGL cannot draw, an
embedded stage renders nothing and the still picture stays. The home page's choice of country is shared by the three
sections (`components/home/Pick.js`).

## Site chrome

The header (`components/site/SiteNav.js`) opens the search with its button, `⌘K`/`Ctrl K`, or `/` outside the
console (`components/site/Palette.js`): Enter opens the country page, Shift+Enter the console. Layout, buttons,
hero entrance and the two scroll moments come from the design kit copied unchanged into `public/assets`
(taste-skill 2.5.1); the product's own styles are in `app/styles/`.

The benchmarks for function are CoupCast, ViEWS and ACLED CAST: a ranked list, a map, a country page
and a forecast-versus-outcome record. The console keeps exactly those four things and nothing else.

## Views

**1 · Signal Field — where.** The world as ~19,000 dots on an equal-area grid (`scripts/build-world.mjs`),
each tagged with its country. Colour, plume height and pulse rate all encode the same value, the
country's probability on a square-root scale topped by the highest current forecast. The eight
highest-risk countries emit rings whose rate grows with risk. `G` unrolls the globe into a plane.
Drag to rotate, click to select.

**2 · Temporal Atlas — when.** One ridge per country, quarterly mean of the published out-of-sample
forecast from 1975, grouped by region. Height is `sqrt(p / 0.30)`. Hover reads a country and quarter;
click selects. The white ridge is the selected country.

**3 · Model Trace — why.** A ledger from a reference country to the published forecast. The reference is the
logistic component's intercept (about 0.25%): where it starts before it knows anything about the country, not the
base rate. One row per variable group (largest push first): a bar on a log-probability axis runs from the
probability before the group's term to the probability after it, amber to the right (raises), cyan to the left
(lowers). Beside the bar, a skyline places the country among every other country with structural records on the
same group (log-odds), with a "top x%" / "bottom x%" label. Below the groups: the logistic model (the sum of the
terms), the average of the ensemble members (dots show each member), and the published forecast, calibrated, with
its 80% range. For territories without structural records the group terms are imputed, and the footer says so.
Clicking a row filters the drivers list. The rows are crisp SVG (`TraceLedger.js`, layout in `ledger.js`); the
peer distributions come from `/api/trace` (`lib/trace-peers.js`, read from the published export). Tree components
are not decomposed and nothing here claims they are. The swarm is only texture under the lines (see Rendering).

## Rendering

`components/console/engine.js` is a small WebGL2 renderer with no dependencies. All three views draw
into one low-resolution buffer (2–3 device pixels per cell), which a second pass quantises to four
levels with an 8×8 Bayer matrix. That pass also adds the drifting background grain and the sweep.
Text, numbers and the timeline are ordinary HTML/SVG and are never dithered.

Motion never changes a value: positions are fixed by the data and only brightness, flow phase and
plume travel are animated. `M` freezes it; `prefers-reduced-motion` starts frozen. Drawing stops when
the tab is hidden or the stage is off screen. Without WebGL2 the list, readout and timeline still work.

Visual references: [WebGL Shader Lab](https://github.com/PSCactux/webgl-shader-lab) (particle morph,
wireframe terrain), the three.js attractor-particles example (continuous transport),
[Bayer dithering demo](https://github.com/zavalit/bayer-dithering-webgl-demo) (ordered dither, ripples).
The code is original.

## Zoom, camera and trace simulation

All three views share a camera (`clip' = (clip − pan) × zoom`, 1× to 8×): wheel or pinch zooms about the
cursor, drag pans (on the globe it rotates), `+ − 0` and the buttons at the top right of the stage zoom and
reset. Text labels follow the camera but keep their size.

The **Model Trace** keeps a GPU particle simulation underneath the ledger as texture: 65,536 particles (16,384 on narrow
screens) in float textures, advanced by curl noise inside one band per ledger row, streaming along the bar in the
direction of the push, with a small vortex at the published marker whose size and spin follow the final probability.
The number of particles drawn per band is capped to a constant density, so a short bar is not saturated; the swarm never
carries a value. The canvas is dimmed (CSS) so the vector lines and numbers are what you read, and the view does not zoom.

Code adapted under the MIT licence from [PSCactux/webgl-shader-lab](https://github.com/PSCactux/webgl-shader-lab)
(Copyright (c) 2026 PSCactux): simplex/curl noise and the ping-pong GPGPU layout from `CurlSwarm.tsx`, the
vortex and ring halo from `Portal.tsx`. Simplex noise by Ashima Arts and Stefan Gustavson (MIT).
