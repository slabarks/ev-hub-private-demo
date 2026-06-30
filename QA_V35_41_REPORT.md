# QA v35.41 — Portfolio table readability fix

## Scope
- Keep v35.40 matched Portfolio Calibration benchmark logic intact.
- Fix the Portfolio Comparison table layout issue where the Model basis text could overlap the Variance and Status columns on laptop widths.

## Changes
- Added concise Model basis display in the table, e.g. `Y2 · rolling 30D`.
- Preserved full Model basis in the HTML title tooltip and selected-site detail card.
- Added protected 10-column table widths for desktop/tablet viewports.
- Preserved mobile card layout below 720px.
- Updated cache-busting version to `35.41-table-readability`.

## Tests run
- `node --check js/app.js`
- `npm test`
- all static `.mjs` regression tests
- `python3 -m py_compile local_site_location_server.py`

## Result
Passed.
