# Country temporal observatory

The animated panel is driven by `/api/countries/[slug]`. It replaces the abstract orbit and tube with two country-specific views.

- **Impronta**: real country outline from Natural Earth/world-atlas; a sampled land mesh is decorative geography, never event locations. Three rings show up to the latest 180 available months of protests/riots, armed violence and reported fatalities. Radial lengths use log(1+count), normalized separately per channel. Threads connect the same calendar month in successive years; they do not assert causality. Travelling lights emphasize these comparisons without changing values.
- **Sequenza**: layered contours trace the actual monthly series. Faint interior fibers are graphic fills, not uncertainty intervals or forecasts. Colors separate channels.
- Diamonds mark successful or failed coup attempts in the existing database, confidence A–C, excluding duplicates and year-only dates. These classifications are inherited from the database, not independently verified by the visualization.
- Slider, monthly matrix, canvas clicks, playback and coup bookmarks share a single month selection. Readouts always show exact counts. Country changes abort outstanding fetches and suppress stale results.
- Forecast probability and model contributions are shown separately from the historical cursor. The horizon comes from metadata.

Motion has a separate effects pause and history playback control. Reduced-motion preferences disable ambient movement and automatic playback. Offscreen and hidden-tab rendering is suspended; canvas resolution is capped at 2x and animation updates at about 30 fps. Keyboard users can explore via slider, matrix and bookmark buttons.

Validation: Next production build; browser desktop and 390px layout; country change Guinea-Bissau → Niger; historical bookmark February 2022 (0 unrest, 3 violence, 11 fatalities checked against bundled series); playback and pause; no browser errors. No raw data, model changes, or new forecast simulations are introduced.
