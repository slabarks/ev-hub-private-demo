# V17.30 — Map-led AADT counter selection

## Purpose
Makes AADT counter selection map-led and production-safe. The user can now validate the counter visually and select the preferred TII counter directly from the map popup.

## Changes
- Added browser-side attempt to load the official TII Traffic Counter Locations GeoJSON and join it to the bundled AADT values.
- Kept bundled local/geocoded AADT records as fallback when the official TII location file cannot be reached.
- Limited the recommendation list to the top 4 AADT counters only.
- Added large, high-visibility map markers for the top 4 recommended counters.
- Added popup details on hover/click:
  - counter ID/name
  - route
  - AADT
  - distance from site
  - confidence
  - coordinate source
  - method/basis
- Added `Use this counter` directly inside the map popup.
- Added optional `Show diagnostic nearby counters on map` toggle; hidden by default to avoid clutter.
- Fixed the V17.29 overlay removal order bug where AADT markers could be created and then immediately removed during the same map render.

## UX rules
- Default map shows only the top 4 recommended counters.
- Other nearby TII counters are shown only when the diagnostic toggle is enabled.
- The nearby charger/site radius remains separate and does not control AADT selection.
- Manual map selection updates AADT used and source text without switching to manual-AADT mode.
