# QA v35.21 — Portfolio concise table + status action popover

## Scope
- Restored the Portfolio Calibration main table to the concise annual comparison layout:
  - Site
  - Maturity
  - Category
  - MIC
  - AADT
  - Actual kWh/yr
  - Model kWh/yr
  - Variance
  - Status
- Removed the wide main-table action columns introduced in v35.17:
  - kWh/plug/day
  - Year
  - Action
- Added clickable Status pills.
- Added a status recommendation popover showing:
  - site name
  - action year
  - short action
  - recommendation
  - reason/diagnosis
  - trigger and driver
- Popover close behaviour:
  - closes when the user clicks outside it
  - closes from the close button
  - closes on Escape
  - closes on tab/hash change, resize, or scroll
- Kept detailed kWh/plug/day, benchmark and MIC detail inside the selected-hub panels instead of the main matrix.

## Tests run
- `node --check js/app.js` — passed
- `npm test` — passed
- `node tests/portfolioBenchmarkSmoke.mjs` — passed across all 32 sites
- `node tests/portfolioLoadSearchStatic.mjs` — passed
- `node tests/advancedSettingsVisibilityStatic.mjs` — passed
- `node tests/portfolioStatusPopoverStatic.mjs` — passed

## Notes
- The Year/action timing is now shown inside the Status popover rather than as a separate column, preserving the clean layout and reducing horizontal overflow risk.
