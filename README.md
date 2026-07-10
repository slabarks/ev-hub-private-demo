# EV Charging Hub Investment Tool — V17.38 Lean Production Build

This is the production deployment package for **V17.38**.

V17.38 retains the audited AADT resolver and maturity-aware financial engine, and refines the **Portfolio Financials** tab with a simpler maturity overview, clearer labels and an optional explanatory chart.

## Included improvements
- Portfolio Financials dashboard now includes a dedicated **Maturity outlook** window.
- Portfolio Financials CAPEX comparison now uses the **modelled 20-year CAPEX projection** for apples-to-apples comparison.
- Average maturity timing and maturity confidence are surfaced directly in the overview dashboard.
- The maturity chart is no longer forced into the main overview; it is now optional and explanatory.
- Clearer maturity wording in the site table and summary section.
- Browser/server/package version alignment uplifted to V17.38.

## Run locally
```bash
python server.py
```
Then open `http://localhost:10314/`.

## Test command
```bash
npm test
```

## Validation result
PASS — V17.38 AADT, CAPEX bands, monthly history, maturity forecasting, exports, API and static smoke tests completed successfully.

## Key files
- `index.html`
- `js/app.js`
- `js/engines/maturityEngine.js`
- `js/engines/exportEngine.js`
- `server.py`
- `tests/runTests.js`
- `RELEASE_NOTES_V17.38_FINANCIAL_UI_REFINEMENT.md`
- `V17.38_PRODUCTION_VALIDATION.md`
