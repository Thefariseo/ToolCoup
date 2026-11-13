# ToolCoup research workstation

The interface is an English-language analytical workstation using locally bundled JetBrains Mono. A flat olive-black palette separates three consistent signal colors: cyan for unrest, amber for political violence and lavender for reported fatalities.

## Benchmarks

- [Kepler.gl](https://kepler.gl/): persistent layer controls and time playback.
- [CARTO Builder widgets](https://docs.carto.com/carto-user-manual/maps/widgets): linked time series, filters and inspection.
- [ACLED Explorer](https://acleddata.com/conflict-data): country trends and separate event/fatality indicators.

These references inform interaction and hierarchy. The temporal atlas and calendar terrain are custom visualizations, not reproductions of those products.

## Visual encoding

The atlas shows observed monthly counts on three independently log-scaled radial bands. Fibers connect the same calendar month at one-to-five-year lags; neither causal relationships nor geographic movement are implied. Fine outer arcs summarize annual channel totals. Peripheral strips show annual totals and calendar-month means within the selected window. The stippled country silhouette is geographic context, not event geolocation.

The terrain maps calendar month, year and log-scaled count to a projected mesh. Square nodes are recorded observations. Fine surface stippling interpolates between known neighboring samples, and is not additional data. Animated tracers and scanning highlights move across existing geometry. Motion never changes counts or generates forecast scenarios.

Historical coup markers require A–C confidence, no duplicate flag and at least month-level date precision. Latest forecasts remain separate from the historical cursor. Source definitions and estimates are inherited from the current export.

## Working controls

- 5-, 10- and 15-year windows, clipped to available records.
- Independent channel visibility.
- Linked date cursor, heat matrix, coup bookmarks and readouts.
- Playback at 0.5×, 1× and 2×, plus separate ambient-motion control.
- Focus mode; Escape exits.
- CSV export of the selected country's displayed monthly series.
- Country search, worldwide risk map, historical archive, country dossier and methodology.

Motion is capped at approximately 30 frames per second, paused offscreen and in hidden tabs, and disabled for reduced-motion preference. Rendering caps pixel density at 2×. Exact values remain available outside canvas, with a keyboard-accessible date slider and matrix.

## Compatibility

The methodology supports both the existing object-shaped model metrics and the updated array-shaped ensemble export. Absent calibration or interval data is explicitly identified. Translation maps affect presentation labels only and include the updated model's structural features. Dataset values, source keys and pipeline code are not changed by the design update.
