# Console

One screen, four fixed regions around one moving field.

| Region | Job |
|---|---|
| Watchlist (left) | Every forecast country ranked by 6-month probability. Filter with `/`, move with `↑ ↓`. |
| Stage (centre) | Three views of the same selection: where, when, why. Keys `1 2 3`. |
| Timeline (below the stage) | The selected country since 1975: published monthly risk, recorded coups, ACLED counts. |
| Readout (right) | The number, its 80% interval, rank, change, coup record and the six largest drivers. |

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

**3 · Model Trace — why.** Seven variable groups feed the logistic component of the ensemble. Stream
width is the group's absolute log-odds contribution on a fixed scale (full width at 1.8), so streams
are comparable between countries; amber raises, cyan lowers. Clicking a group
filters the driver list. The swirl's size and pulse follow the final calibrated probability. Tree
components are not decomposed and nothing here claims they are.

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
