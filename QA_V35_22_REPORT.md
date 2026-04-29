# QA v35.22 - Portfolio Filters, Investor PDF Portfolio Export, XLSX Export Fix

## Scope
- Cleaned the Portfolio Calibration multi-select filter dropdowns so options render as clear checkbox rows.
- Added single-open dropdown behaviour for the Portfolio Calibration filters.
- Added close behaviour for filter menus on outside click, Escape, scroll and resize.
- Added Portfolio Calibration Benchmark section to the Investor PDF export.
- Replaced the fake HTML `.xls` annual financial export with a real OOXML `.xlsx` workbook download.
- Added a Portfolio Calibration sheet to the annual financial XLSX workbook.

## Verification performed
- `node --check js/app.js` passed.
- `node --check js/engines/exportEngine.js` passed.
- `/usr/bin/python3 -m py_compile local_site_location_server.py` passed.
- Core engine test passed: `node tests/runTests.js`.
- Portfolio benchmark smoke test passed across the 32-site calibration set.
- Portfolio load-to-map regression passed.
- Portfolio status popover static regression passed.
- Advanced settings visibility regression passed.
- New Portfolio filter layout static regression passed.
- New XLSX/PDF export static regression passed.
- Browser XLSX export generation was simulated in Node; the created file was detected as `Microsoft Excel 2007+` and `unzip -t` reported no archive errors.

## Notes
- The Annual Financials export now downloads as `ev_hub_annual_financials.xlsx`, not `.xls`, so Excel should no longer display the file-format/extension mismatch warning.
- The Investor PDF portfolio section uses the concise benchmark table style: Site, Maturity, Category, MIC, AADT, Actual kWh/yr, Model kWh/yr, Variance and Status.
