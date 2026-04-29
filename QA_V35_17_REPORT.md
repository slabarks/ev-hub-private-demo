# QA Report — v35.17 Portfolio Annual Benchmark Usability

## Scope
This version refines the Portfolio Calibration page after v35.16.

Implemented changes:
- Replaced single-select Portfolio filters with compact multi-select checkbox dropdowns.
- Kept the main portfolio matrix concise and annual-based.
- Kept MIC and AADT visible in the main matrix.
- Added `kWh/plug/day` to the main portfolio matrix.
- Added `kWh/plug/day` to the selected hub overview cards.
- Added trigger `Year` and short `Action` columns to the main matrix.
- Moved site category under the site name to save horizontal space.
- Compressed the selected hub detail into collapsed secondary panels:
  - Traffic and benchmark detail
  - MIC / grid capacity detail
  - Configuration and 20-year do-nothing path
  - Model QA diagnostics
- Added `Recommended MIC by Year 20` and `Year 20 MIC gap` inside the MIC / grid capacity detail panel.
- Added compact table styling so long site names wrap within the table margins.

## Validation performed
- `node --check js/app.js` passed.
- `npm test` passed.
- `node tests/portfolioBenchmarkSmoke.mjs` passed across all 32 clean ROI operating sites.
- `python3 -m py_compile local_site_location_server.py` passed.

## Portfolio smoke result
`{"under_capture":7,"capacity_pressure":11,"outperforming":3,"normal":2,"maturity_ramp":9}`

## Notes
- The main comparison remains annualised because the investment model is year-based.
- Rolling 30D values remain available in the collapsed Model QA diagnostics panel only.
- Sites with less than 12 months of data continue to be labelled as annualised run-rate rather than full annual actuals.
