# QA Report — v35.35 live-upload cache guard

- Bumped frontend cache tag to `35.35-live-upload-cache-guard`.
- Bumped Portfolio Calibration live-actuals sessionStorage key to invalidate old v35.34/v1 snapshots.
- Added guard to reject cached live snapshots that mention `Running_Total`/cumulative files as parsed actuals.
- Legacy `evHub.portfolio.liveActuals.v1` is removed automatically on app load and reset.
