# QA v35.23 - Investor PDF Label Alignment

## Change implemented
- Updated Investor Report card copy to remove the outdated "tabs 1-6" wording.
- New label now states that the Investor PDF covers Site Screening, Demand Forecast, Product Configuration, Investment Case, Annual Financials, Scenario Ranking and Portfolio Calibration.
- No calculation, export engine, portfolio benchmark, or model logic changes were made.

## Verification
- `node --check js/app.js` passed.
- `npm test` passed.

## Notes
- This is a text/UI label-only update to align the Investor PDF description with the Portfolio Calibration section now included in the report.
