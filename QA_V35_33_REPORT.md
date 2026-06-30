# v35.33 Validation Report

## Scope
This revision refines the Portfolio Calibration live-data workflow and operating-hub load behaviour.

## Implemented fixes
- Calibration files now auto-validate immediately after file selection; the separate "Validate and use uploaded actuals" button has been removed.
- Fallback control is now labelled "Reset to stored app data".
- Upload guidance now clearly separates minimum required, recommended full pack, and optional support/trend files.
- Non-primary uploaded files are shown as supporting files in a collapsed details section rather than alarming warnings.
- Uploaded live sites that are not part of the mapped 32-site calibration library now appear in the operating hub selector under "Uploaded live sites requiring setup".
- Uploaded-only sites show actuals but block model loading until MIC, AADT and charger setup are confirmed.
- Non-standard operating-site MIC values are mapped to the next approved model MIC when loading into Product Configuration. Example: 700 kVA actual MIC maps to 800 kVA model MIC.
- Selected hub dashboard now includes "Model-equivalent initial CAPEX".

## Validation run
- JavaScript syntax check: passed.
- Python server compile: passed.
- Core engine tests: passed.
- Direct parser test with supplied calibration files: passed.
  - Latest actuals date: 2026-06-28.
  - Charger-level parsed source: Daily_Charger_kWh.xlsx.
  - Site count detected: 43.
  - Supporting files detected without warning state.
- Local HTTP multipart upload test: passed.
  - `/api/import-live-calibration` returned ok=true.
  - Parsed 43 live sites.
  - Warnings array empty for supporting files.
- Static UI checks: passed.
  - Removed "Validate and use uploaded actuals".
  - Added grouped selector labels for mapped hubs and uploaded sites requiring setup.
  - Added "Reset to stored app data".
  - Added "Model-equivalent initial CAPEX" card.

## Notes
The 32 mapped calibration sites remain the benchmark table basis. Additional uploaded live sites are visible in the selector but are deliberately marked as setup-required until model metadata is confirmed.
- Invalid-upload fallback test: passed. Endpoint returned 400 with actionable what-to-do guidance and preserved stored-data fallback behaviour.
- Tullamore MIC mapping check: passed. Actual 700 kVA maps to approved 800 kVA model MIC.
- Uploaded-site grouping check: passed. Supplied files map 32 clean sites and expose 11 additional uploaded sites requiring setup.
