# QA Report — v35.27 Benchmark Profile Presets

## Changes implemented
- Added a site-type benchmark profile selector to Demand Forecast → Editable demand assumptions.
- Added address-based site-type suggestion with confidence and reasoning.
- Applying a profile now loads benchmark demand factors:
  - site relevance factor
  - site capture rate
  - effective AADT cap
  - target sessions per 1,000 AADT benchmark
- Added effective AADT cap into the active demand engine, so selected profiles can cap unrealistically broad/high AADT exposure before demand is calculated.
- Preserved user control: the profile can be changed manually, and the model displays the selected/suggested profile and loaded factors.
- Carried forward stronger laptop/tablet top-navigation fit logic and stronger Scenario Ranking gradient styling.

## Verification performed
- `node --check js/app.js` passed.
- `node --check js/engines/demandEngine.js` passed.
- `npm test` passed.
- `python3 -m py_compile local_site_location_server.py` passed.
- Static regression tests passed:
  - advanced settings visibility
  - annual Excel / investor PDF export wiring
  - portfolio benchmark smoke test
  - portfolio filter layout
  - portfolio load-to-map
  - portfolio status popover
  - responsive layout
  - demand benchmark profile
- Manual engine check confirmed effective AADT cap reduces Year 1 demand as expected.

## Notes
- Address-based site type detection is a recommendation, not a hard classification. The user can override the profile.
- Target sessions per 1,000 AADT is shown as a benchmark guidance metric. The active demand engine is driven by relevance, capture, site limitation, BEV assumptions, ramp-up, and the effective AADT cap.
