# QA Report — v35.45 Mapping, Upload Safety and Kempower Triple-Cabinet Fix

## Scope implemented

- Live-data upload merge protection:
  - positive uploaded actuals update existing actuals;
  - missing, blank, null and zero uploaded actuals do not overwrite existing/static actuals;
  - sites missing from the latest upload are marked as retained rather than zeroed;
  - actual source/status is exposed in the selected-site QA diagnostics.
- Verified hardware mapping corrections from `ePower_Site_Data_Mapping.xlsx` plus user overrides:
  - Mallow Plaza, Axis, Charleville, Castletroy, Newtown Park Hotel and O'Brien's Larkin's Cross now load as `2 × Autel DH480 / 4 plugs`.
  - Corrib Oil Swinford and Supervalu Tipperary now load as `1 × Autel DH480 / 2 plugs`.
  - Ahern's Castlemartyr and Aherns Carrigtwohill remain `1 charger / 2 plugs`.
  - Douglas Court remains `4 active plugs`.
  - Banner Plaza current live state is `1 × Kempower triple cabinet / 4 active plugs`; full installed design metadata is retained as `2 × triple cabinets / 8 plugs`.
  - Anner Hotel is retired from active portfolio calibration.
  - Killashee House Hotel is retained as a future-only verified hardware record.
- Kempower Triple Cabinet quantity support:
  - new Product Configuration selector allows `1` or `2` triple cabinets when `Kempower Triple Cabinet` is selected;
  - second triple cabinet increases cabinet power/cost/commissioning only;
  - active satellites/plugs remain controlled by the satellite count.

## Regression tests run

- `node --check js/app.js`
- `node --check js/engines/technicalEngine.js`
- `node --check js/engines/optimizerEngine.js`
- `node --check js/data/civilElectricalCostLibrary.js`
- `node --check js/data/platformLibrary.js`
- `node --check js/data/operatingHubCalibrationLibrary.js`
- `python -m py_compile local_site_location_server.py`
- `npm test`
- All static `.mjs` tests:
  - AADT mapping
  - Advanced settings visibility
  - Demand benchmark profile
  - Export XLSX / portfolio PDF static checks
  - Grant support render recursion guard
  - Hardware mapping regression
  - Kempower triple-cabinet quantity regression
  - Live upload merge-safety regression
  - Portfolio benchmark smoke
  - Portfolio filter layout
  - Portfolio load → Site Screening
  - Portfolio status popover
  - Responsive/version check
  - ZEVI funding static checks

## Key validation results

- Existing engine gold-standard calculations still pass.
- Existing Autel default scenario remains unchanged.
- 2 × Kempower triple cabinet gives 1,200 kW cabinet power without automatically increasing plugs.
- 2 × Kempower triple cabinet supports up to 8 dual satellites / 16 plugs.
- Existing 1 × Kempower triple cabinet behaviour remains 600 kW.
- Portfolio active site count is 37 after retiring Anner and keeping Killashee future-only.
- All active portfolio sites retain valid AADT mappings.
- All corrected hardware configurations validate successfully.
- No live upload merge path blindly spreads zero/blank uploaded actuals over stored actuals.

## Packaging

The package is short-path safe and below the user's GitHub file-count constraint. Historical QA reports from older builds were removed from the release package; the current v35.45 QA report is retained.
