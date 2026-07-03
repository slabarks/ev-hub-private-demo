# V17.4 Financials Payback Audit Fix

This release tightens the Portfolio Financials tab after review of V17.3 output.

## Fixes

- Payback now distinguishes between:
  - CAPEX missing
  - operational days missing
  - low operating history
  - negative run-rate cashflow / no payback
  - valid positive-cashflow payback
- Negative EBITDA sites no longer show “Not enough data” in the payback cell.
- Missing CAPEX no longer masks site performance status when operating data exists.
- Low/missing operating history is the only condition that greys out a row as immature/inactive.
- CAPEX-missing or revenue-estimated rows are shown as partial review rows instead of inactive rows.
- OPEX cells now show that OPEX excludes electricity and show the annual electricity cost used by EBITDA.
- Dashboard KPIs now separate low/missing history, CAPEX missing, and no-payback sites.

## Validation

- npm test passed.
- All .mjs static/smoke tests passed.
- Portfolio Financials calculation smoke passed with new negative-cashflow payback regression.
- Comprehensive burn test passed: 417 scenario runs, 0 failures, 0 warnings.
- AADT regression passed: 24 passed, 0 failed.
