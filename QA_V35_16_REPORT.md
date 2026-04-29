# QA v35.16 — Portfolio Annual Comparison Simplification

## Scope
- Restored the clear Portfolio Calibration comparison-table structure requested by the user.
- Kept the key user-visible metrics in the main table: Site, Maturity, Category, MIC, AADT, Actual annual kWh, Modelled annual kWh, Variance and Status.
- Removed the wide, busy benchmark matrix from the main page and moved detailed benchmark diagnostics into the selected-site / expandable diagnostics area.
- Changed the main Portfolio comparison from 30D/monthly comparison to annualised kWh comparison, aligned with the year-based financial model.
- Kept 30D values only inside the technical diagnostics section for QA and audit.

## Important data note
- The current operating hub data library contains latest rolling 30D actuals and data-history length.
- Where explicit trailing-12-month actual kWh is not available in the source data, the app annualises the latest operating run-rate using daily kWh × 365.
- Sites with less than 12 months of history are labelled as annualised run-rate, not true full-year actuals.

## Validation performed
- `node --check js/app.js` passed.
- `node tests/runTests.js` passed.
- `node tests/portfolioBenchmarkSmoke.mjs` passed across all 32 clean ROI operating sites.
- `/usr/bin/python3 -m py_compile local_site_location_server.py` passed.

## Portfolio benchmark smoke output
```json
{"under_capture":7,"capacity_pressure":11,"outperforming":3,"normal":2,"maturity_ramp":9}
```

## Files changed
- `js/app.js`
- `assets/styles.css`
- `QA_V35_16_REPORT.md`
