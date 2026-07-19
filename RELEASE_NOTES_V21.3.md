# V21.3 release notes

## Calibration upload correction

The calibration upload no longer relies on the running Python backend to return the latest daily/monthly history schema.

- Added a packaged browser-local ZIP/XLSX parser.
- The standard dashboard ZIP and `Daily_Charger_kWh.xlsx` are processed directly in the browser.
- Complete continuous daily histories, rolling-30 kWh and monthly observations are produced using the same commercial-start and annualisation rules as `server.py`.
- The upload API remains available as a fallback for non-standard files.
- An incomplete 200 response from an older backend is skipped while other compatible routes are tried.
- The upload status now identifies browser-local processing and its elapsed time.
- Added packaged JSZip with its third-party notice.

## Data integrity

- Only the canonical `Daily_Charger_kWh` workbook is used as the primary source.
- `Ignore` folder entries are skipped when a ZIP is uploaded.
- Zero-demand days remain in the operating-period denominator.
- Missing source dates remain explicit in daily-history diagnostics.
- The last valid dataset remains active until a replacement passes full validation.
