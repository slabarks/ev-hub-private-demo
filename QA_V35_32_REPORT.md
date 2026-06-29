# QA V35.32 Report — Live Calibration Upload

## Scope
Implemented session-based live calibration upload for Portfolio Calibration.

## Key changes
- Added `/api/import-live-calibration` Python endpoint.
- Added multi-file upload UI in Portfolio Calibration.
- Uploaded files are validated before use.
- Stored calibration library remains the fallback.
- Valid uploaded actuals are merged at runtime only; static metadata, MIC, AADT and charger configuration remain unchanged.
- Added latest actuals status, matched clean sites, additional live sites and upload warning/error messages.

## Validation performed
- JavaScript syntax check: passed.
- Python server syntax check: passed.
- Core engine tests: passed.
- Live upload parser direct test using uploaded dashboard exports: passed.
- Local HTTP endpoint multipart upload test: passed.
- Static library match check: 32/32 clean calibration sites matched from uploaded Daily_Charger_kWh.xlsx.
- Additional live sites detected: 11.
- Latest actuals date detected: 2026-06-28.

## Safety behaviour
- If no upload is provided, the app uses the stored calibration library.
- If upload validation fails, the app shows an error and continues using stored calibration data.
- Upload processing is read-only and only uses files explicitly selected by the user.
