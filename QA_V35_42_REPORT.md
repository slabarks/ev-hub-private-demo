# QA v35.42 — Portfolio table clarity fix

## Change summary
- Hid the `Model basis` column from the Portfolio Comparison table to reduce visual noise.
- Hid the same column from the investor PDF portfolio benchmark table.
- Preserved the full model-basis audit trail in the selected-hub detail card, status popover and Portfolio Calibration XLSX export.
- Rebalanced the Portfolio Comparison desktop/tablet column widths for the 9-column layout.
- Updated CSS/JS cache busting to `35.42-portfolio-basis-hidden`.

## Regression checks run
- `node --check js/app.js`
- `node --check js/engines/exportEngine.js`
- `npm test`
- all static `.mjs` regression tests in `/tests`
- `python3 -m py_compile local_site_location_server.py`

## Result
Passed. The main Portfolio Comparison table now focuses on Site, Maturity, Category, MIC, AADT, Actual / annualised kWh, Matched model kWh, Variance and Status.
