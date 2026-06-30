# QA Report — v35.34 CAPEX/live calibration bugfix revision

## Scope
- Fixed live calibration upload parser so cumulative/running-total exports are supporting files only and do not inflate rolling 30-day kWh.
- Updated stale responsive static regression cache-busting check.
- Added CAPEX calibration metadata for known operating hubs and selected-site CAPEX display.
- Added actual CAPEX override for known portfolio sites when loaded into the model.
- Added new mapped live sites: Aldi Donabate, SCG Cobh Golf Club, SCG Dundalk Golf Club, Douglas Court, Banner Plaza Ennis, Texaco Newcastle.
- Preserved the original 32-site benchmark peer pool via `benchmarkEligible !== false` on newly added mapped sites.
- Corrected Oran Point MIC to 199 kVA and Tullamore model mapping to 5 × Autel DH480.

## Regression tests run
- JS syntax checks: app, technical engine, export engine, operating hub calibration library.
- Python syntax check: local site server.
- `npm test`: core demand, technical, financial, scenario and battery right-sizing regression suite.
- Static UI/export tests: advanced settings, demand benchmark profile, export/PDF static, portfolio filters, portfolio load search, portfolio status popover, responsive layout.
- Portfolio benchmark smoke: 38 mapped sites total, original 32 clean benchmark peer sites preserved.
- Local server GET smoke test: passed.
- Live upload API smoke test using Daily_Charger_kWh + kWh_Running_Total + Rolling_30D: passed; running total excluded from actuals.
- XLSX export generation and OOXML structure scan: passed; 5 sheets, no NaN/Infinity/null/#REF!/#VALUE!/#DIV/0! tokens.

## Key expected behaviours verified
- Full upload pack no longer inflates rolling 30-day kWh.
- Daily_Charger_kWh remains the parsed actuals source.
- kWh_Running_Total is reported as a supporting cumulative file.
- New live upload detects 43 physical sites.
- 38 sites match static/mapped records after adding Aldi, Cobh, Dundalk, Douglas, Banner Plaza and Texaco Newcastle.
- 5 review/mixed sites remain uploaded setup-required/reference only: Ashbourne, Banbridge, Fota, Killashee, West Point Ennis.
- Known-site actual CAPEX override works in the technical CAPEX engine.
- DC50 remains available for future small-site modelling and is kept separate from the original high-power benchmark peer pool.

## Notes
- Hardware unit costs, ESB library, battery library, demand model, scenario ranking and battery right-sizing logic were not changed.
- CAPEX actual override applies only when a known portfolio site with actual CAPEX is loaded into the model.
