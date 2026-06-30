# QA V35.37 Report — Portfolio maturity/status UX

## Scope
- Portfolio Calibration early-site status hierarchy updated.
- Early sites now show primary status `Ramp-up` instead of `Capacity pressure`, `Under-capturing`, or `Outperforming`.
- Early sites retain a secondary signal in the status popover where relevant.
- Maturity badges are clickable and explain Mature, Near-mature, Early, and Review definitions.
- Portfolio table label updated to `Actual / annualised kWh/yr`.
- Export status logic aligned so early sites export as `Ramp-up`.

## Regression completed
- `npm test` passed.
- All static `.mjs` regression tests passed.
- JS syntax checks passed for `app.js`, `exportEngine.js`, and `financialEngine.js`.
- Python server syntax check passed.
- Live calibration parser smoke test passed with `Daily_Charger_kWh.xlsx`, `kWh_-_Running_Total.xlsx`, and `Rolling_30_Day_Total_-_Euro_All_Sites.xlsx`.
- XLSX export generated and validated with `openpyxl`.
- Generated XLSX contains expected sheets and no `NaN`, `Infinity`, `null`, `#REF!`, `#VALUE!`, or `#DIV/0!` markers.

## Specific status checks
- SCG Cobh Golf Club: Early → primary `Ramp-up`, secondary `Review`.
- SCG Dundalk Golf Club: Early → primary `Ramp-up`, secondary capacity signal retained.
- Douglas Court: Early → primary `Ramp-up`, secondary signal retained.
- Banner Plaza Ennis Junction 12: Early → primary `Ramp-up`, secondary signal retained.
- Tullamore Retail Park: Early → primary `Ramp-up`.
