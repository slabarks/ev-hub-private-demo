# V17.42 — Flat-root deployment and calibration-upload hotfix

## Corrected

- Removed the outer application folder from the deployment archive.
- Added startup validation across `server.py`, `DEPLOYMENT_MANIFEST.json`, `index.html` and `js/app.js`.
- Added `flat-root-v1` package-layout verification.
- Added `/api/health` for deployment health checks.
- Improved frontend/backend mismatch messaging so it explicitly identifies a deployment problem rather than blaming the selected Excel files.
- Preserved expected and actual build information in the displayed error.
- Added safe direct upload support for the complete dashboard ZIP pack.
- Added `.zip` to the file picker and revised the upload guidance.
- Advanced browser cache-busters and live-upload storage schema.

## Retained from V17.41

- Performance versus model in the site financial table.
- Forecast-confidence removal from the primary investor table.
- 1–20-year projection horizon.
- Directional CAPEX delta and CAPEX delta percentage font colours.
- Day-one CAPEX, next-12-month financials, site EBITDA and run-rate payback logic.
- Long-term maturity logic only from month 13 onward.

## Build identity

- Application: `V17.42`
- Build: `EVHUB-V17.42-20260710-R1`
- Upload schema: `v17.42-live-history-v3`
- Parser: `EVHUB-LIVE-PARSER-17.42.1`
- Package layout: `flat-root-v1`
