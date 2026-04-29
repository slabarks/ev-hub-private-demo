# QA v35.19 — Portfolio Site Map Search Bridge Fix

## Issue fixed
When loading an operating hub from **Portfolio Calibration** into the main model, the app previously preloaded the model configuration and AADT but skipped the normal Site Screening search flow. This meant the map could remain stale or use the old Ireland-centre fallback coordinate instead of refreshing the selected site location and nearby charging coverage.

## Changes made
- Updated the Portfolio Calibration load action to open **Site Screening** instead of jumping directly to Investment Case.
- Added a pending portfolio-site search handoff so Site Screening automatically runs the normal address/map search after the tab opens.
- The search now refreshes:
  - address geocoding,
  - map centering,
  - nearby charger search,
  - radius/filter-based charger coverage,
  - search status messaging.
- Preserved the portfolio calibration values after the map search:
  - matched AADT,
  - actual MIC,
  - model-equivalent charger configuration,
  - no-battery operating-hub setting.
- Reworded the button to **Load site into model + map**.
- Added static regression coverage to prevent future versions from bypassing Site Screening again.

## Validation performed
- `node --check js/app.js` — passed.
- `node tests/runTests.js` — passed.
- `node tests/portfolioBenchmarkSmoke.mjs` — passed across all 32 clean ROI portfolio sites.
- `node tests/portfolioLoadSearchStatic.mjs` — passed.
- `/usr/bin/python3 -m py_compile local_site_location_server.py` — passed.

## Notes
The Site Screening search still depends on available geocoding providers for exact rooftop location. If external geocoding cannot resolve an Eircode/address, the existing fallback logic still applies. The workflow bug is fixed: portfolio load now activates the same search/map/nearby-charger flow used for normal new-site screening.
