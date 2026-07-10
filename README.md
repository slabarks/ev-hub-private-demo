# EV Hub Investment Tool — V17.32 Official TII AADT Overlay

Current review build: **V17.32 AADT search API alignment + official overlay guard**. This release hardens the map-led AADT workflow so counter markers are drawn only from official TII counter coordinates, never from approximate bundled coordinates or the screened site coordinate.

## What changed

- Exact curated site / Eircode AADT mappings now run **before** any text fallback.
- Address-only AADT lookup now attempts geocoding and coordinate-first, road-aware TII counter matching before text matching.
- Text matching is now a low-confidence fallback only; generic place-token results are labelled **Review required**.
- Curated multi-word matching now requires the actual phrase, preventing broad matches such as `Dublin Road` from catching unrelated Dublin addresses.
- Coordinate-enriched TII AADT records are loaded offline without blocking on the online TII coordinate enrichment call.
- Nearby-site radius is explicitly separated from AADT: radius affects nearby chargers/sites only.
- Multiple counters are blended only when they are same-route/same-corridor and then distance-weighted.
- AADT responses include audit fields: raw/effective AADT, confidence label, waterfall layer, geocode source, and counter candidate details when available.
- The browser now calls `/api/tii-counter-locations` to load official TII counter coordinates through the app server, with direct official GeoJSON as a fallback.
- AADT map popups now open on hover/focus/click and close automatically when the pointer leaves the marker/popup.
- Bundled approximate/offline coordinates are intentionally not used for AADT map markers.
- The Portfolio Calibration table remains focused on maturity, actuals, matched model kWh and variance. The old visible Status column remains removed.
- Active curator profiles remain transparent and auditable in the variance popover.

## AADT waterfall order

1. Golden reference case, where explicitly preserved.
2. Exact curated rule / exact Eircode / approved site alias.
3. Manual or client geocoded coordinates → coordinate-ranked TII counter.
4. Eircode/address geocode → coordinate-ranked TII counter.
5. TII public/daily coordinate lookup if local coordinate lookup fails.
6. Priority special anchors only after curated/coordinate routes fail.
7. Strict text fallback labelled as low-confidence / review-required where appropriate.

## Known data limitation

AADT map markers require official TII counter coordinates. If the official TII counter-location service is blocked or unavailable, the app will not plot approximate/bundled counter markers on the map. This avoids showing a counter at the wrong location.

## Testing

The release was validated from a clean extracted package with:

- `npm test`
- all individual `.mjs` regression tests
- `python tests/aadt_regression_test.py`
- Python compile for `server.py`
- JS syntax checks
- local server smoke test

## Deployment

Use the included Render deployment instructions in `DEPLOY_TO_RENDER.md`, or run locally with:

```bash
python server.py
```

## Prior actual-basis change retained

No demand target recalibration or AADT override changes were made in this release. The prior trailing-365 / partial-cumulative actual-basis logic remains active.

## V17.5 note
Portfolio Financials was audited for landlord OPEX. Active-site OPEX now excludes landlord costs unless verified site-level landlord terms are present, and the table labels EBITDA/payback as pre-landlord where applicable.


## V17.6 note

Landlord GP share and landlord gross-sales share now default to 0 in the base model and reset state. They are applied only when the user manually populates them or site-level landlord terms exist. If both GP share and gross-sales share are populated, gross-sales share takes precedence to prevent double counting.
