# QA V35.14 — Portfolio Calibration Clarity & Back-Test Calibration

## Scope changed
- Continued from `ev_hub_html_app_ready_v35_13_portfolio_calibration_v2.zip` without rebuilding from scratch.
- Portfolio Calibration UI wording clarified around:
  - Actual 30D kWh
  - Base model 30D kWh
  - Calibrated model 30D kWh
  - Base variance
  - Calibrated variance
- Added a compact helper panel explaining actuals, base model, calibrated model, and the variance formula.
- Improved selected-site cards and comparison matrix labels so actual field performance is visually obvious.
- Added effective calibrated AADT and calibrated target sessions per 1k AADT to the selected-site detail area.
- Added Medium-low AADT confidence filtering.
- Sorting status now states the active sort key and direction.
- Portfolio back-test now uses fixed default portfolio assumptions instead of being affected by normal workflow user edits.

## Calibration logic changed
- Base model remains the generic model using the site’s real MIC and model-equivalent configuration.
- Calibrated model now uses a portfolio calibration layer with:
  - site-type target sessions per 1,000 AADT,
  - effective AADT caps to avoid over-crediting irrelevant road traffic,
  - maturity treatment for early / near-mature sites,
  - destination floor for low-AADT hotel/destination sites.
- This only affects the Portfolio Calibration comparison layer. It does not alter the normal new-site workflow calculation engine.

## Smoke test summary
- Clean portfolio calibration site count: 32.
- Mature back-test site count: 6.
- Mature calibrated median absolute kWh variance: 8.5%.
- Mature calibrated sites within ±10%: 67%.
- Mature calibrated sites within ±20%: 100%.

## Verification run
- `node --check js/app.js` passed.
- Key engine and provider JS syntax checks passed.
- `python3 -S -m py_compile local_site_location_server.py` passed.
- Existing engine tests passed: `All EV Hub engine tests passed.`
- Portfolio calibration smoke test passed for all 32 sites.
- Portfolio financial smoke test passed for all 32 sites; checked finite annual financial outputs and summary values.

## Notes
- Accuracy claims should remain mature-only.
- Near-mature and early sites remain visible but should be described as validation / directional evidence, not headline proof.
- The calibration layer improves the demo story but should not be described as perfectly predictive.
