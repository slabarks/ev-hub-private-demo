# EV Hub v35.40 QA Report — Matched Portfolio Benchmark Logic

## Scope

Implemented the Portfolio Calibration review fixes:

- Annual/live actuals are now compared against a matched model basis instead of a generic category run-rate.
- The model side now exposes `Model basis` and uses the configured comparison year for static rolling-30D annualised actuals.
- Uploaded trailing-365 actuals are weighted across operating model years when first-active and latest dates are available.
- Site-type factors remain applied through the category profile: effective AADT cap, target sessions/1k AADT, average session kWh, Year 1/Year 2 ramp-up, and post-steady-state growth.
- `In benchmark` now requires matched variance within ±15% for mature/near-mature sites, with early sites retained as `Ramp-up`.
- UI status logic, XLSX export and investor PDF portfolio logic were aligned.

## Key rules

| Item | v35.40 rule |
|---|---|
| In benchmark tolerance | ±15% matched annual variance |
| Early sites | Always Ramp-up, with secondary signal only |
| Model basis | Model Year N or weighted operating-year basis |
| Static actuals | Rolling 30D annualised, matched to configured comparison year |
| Uploaded mature actuals | Trailing 365D actual, matched to operating-window model years where possible |
| Capacity pressure | Can override an otherwise acceptable variance if utilisation/MIC pressure is visible |

## Regression tests

Passed:

- `npm test`
- `node tests/aadtMappingStatic.mjs`
- `node tests/advancedSettingsVisibilityStatic.mjs`
- `node tests/demandBenchmarkProfileStatic.mjs`
- `node tests/exportXlsxAndPortfolioPdfStatic.mjs`
- `node tests/portfolioBenchmarkSmoke.mjs`
- `node tests/portfolioFilterLayoutStatic.mjs`
- `node tests/portfolioLoadSearchStatic.mjs`
- `node tests/portfolioStatusPopoverStatic.mjs`
- `node tests/responsiveStatic.mjs`
- `python -m py_compile local_site_location_server.py`
- `node --check js/app.js`
- `node --check js/engines/exportEngine.js`

## Smoke result

Portfolio benchmark smoke produced multiple classifications and validated that any row marked `In benchmark` has matched annual variance within ±15%.

Observed smoke band mix:

- In benchmark: 4
- Capacity pressure: 3
- Under-capturing: 1
- Outperforming: 2
- Ramp-up: 28

## Notes

The underlying static portfolio data library is still the v35.39 curated AADT library. v35.40 changes the portfolio comparison and classification logic, not the known-site AADT mapping table.
