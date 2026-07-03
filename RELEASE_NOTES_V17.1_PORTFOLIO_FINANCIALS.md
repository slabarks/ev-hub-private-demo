# V17.1 Portfolio Financial Performance Tab

## Added
- New **Portfolio Financials** tab after Portfolio Calibration.
- Portfolio-level dashboard across all active calibration sites.
- Site-level financial performance table with:
  - operational days,
  - actual CAPEX,
  - model-equivalent CAPEX,
  - CAPEX delta,
  - annualised actual kWh,
  - matched model kWh,
  - kWh variance,
  - next-year revenue,
  - OPEX/year,
  - EBITDA proxy/year,
  - actual-run-rate payback,
  - data-quality/status labels.
- Rows with missing CAPEX, missing kWh or unconfirmed operating days are muted and labelled **Not enough data**.
- Revenue is estimated from annualised kWh × model net selling price only where actual revenue is missing; those rows are marked as estimated.
- OPEX is shown excluding electricity purchase; EBITDA proxy deducts electricity and OPEX from annualised revenue.

## Validation
- `npm test` passed.
- All `.mjs` static/smoke tests passed.
- Comprehensive burn test passed: 417 scenario runs, 0 failures, 0 warnings.
- AADT regression Python test passed: 24 passed, 0 failed.
- Added Portfolio Financials static and calculation smoke tests.

## Note
A full headless browser smoke was attempted but the environment did not have a Playwright browser executable installed. The tab was therefore validated with JavaScript syntax checks, static UI token tests and calculation smoke tests.
