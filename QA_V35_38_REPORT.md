# EV Hub v35.38 QA Report — Autel Battery Cost Split

## Scope
Updated the Autel staged battery deployment/augmentation cost logic based on the agreed commercial split:

- Battery module: €36,260 per unit
- Controller: €8,695 once per site
- Site commissioning: €900 once per site
- Unit installation / cabling / local deployment: €10,000 per unit
- Battery civils/electrical/integration provision: retained from the existing hidden civils/electrical engine and charged once at first deployment

## Logic implemented
For Autel battery envelopes:

- First battery deployment = battery module + controller + site commissioning + unit install + one-off civils/electrical/integration provision
- Later augmentation = battery module + unit install only
- Battery replacement = battery module only
- No repeated controller, commissioning or battery civils on later augmentations

For the regression case `Autel 3x125kW/261kWh`, the validated costs are:

- First deployment: €80,455
- Second augmentation: €46,260
- Third augmentation: €46,260
- Battery replacement unit: €36,260

## Files changed
- `js/data/batteryLibrary.js`
- `js/engines/financialEngine.js`
- `js/engines/technicalEngine.js`
- `js/data/defaultAssumptions.js`
- `tests/runTests.js`
- `index.html` cache tag
- `js/app.js` live actuals storage key
- `tests/responsiveStatic.mjs` cache-busting check

## Regression tests run

### Passed
- `npm test`
- all static `.mjs` tests
- JavaScript syntax checks for `js/` and `tests/`
- Python syntax check for `local_site_location_server.py`
- local server startup and HTTP GET `/`
- live-upload API test with Daily Charger + Running Total + Rolling 30D files
- full live-upload API test with all uploaded dashboard files
- export XLSX generation smoke test
- export XLSX openability validation with `openpyxl`
- no `NaN`, `Infinity`, `null`, `#REF!`, `#VALUE!`, or `#DIV/0!` markers in generated XLSX

## Live upload validation
Full upload detected 43 sites with latest date 2026-06-28.

Confirmed supporting/cumulative files were excluded from actual rolling 30-day calculations:
- `kWh_-_Running_Total.xlsx`
- rolling 30-day summary files
- portfolio summary files

Spot checks:
- Circle K Express Dungarvan rolling 30D kWh = 1,792.701 from `Daily_Charger_kWh.xlsx`
- Douglas Court rolling 30D kWh = 24,747.111 from `Daily_Charger_kWh.xlsx`
- Banner Plaza Ennis Junction 12 rolling 30D kWh = 26,412.431 from `Daily_Charger_kWh.xlsx`

## Notes
The update intentionally changes Autel battery cost treatment. It does not change charger hardware costs, ESB library, demand logic, scenario feasibility/ranking logic, AADT mapping, or Portfolio Calibration site status logic.
