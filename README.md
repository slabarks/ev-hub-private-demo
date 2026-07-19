# EV Charging Hub Investment Tool — V21.3

V21.3 removes the calibration upload's dependency on a matching backend response. The selected `Daily_Charger_kWh.xlsx` or dashboard ZIP is now parsed directly in the browser first, including the complete daily and monthly histories required by Portfolio Financial Performance.

## Build

- Application: `V21.3`
- Build: `EVHUB-V21.3-20260719-R1`
- History schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.4`

## Calibration upload behaviour

The Portfolio Financial Performance upload now:

- reads the complete ZIP or `Daily_Charger_kWh.xlsx` locally in the user's browser;
- extracts the canonical daily workbook and skips files inside `Ignore` folders;
- builds site-level continuous daily history, rolling-30 kWh and monthly history without waiting for the Python upload endpoint;
- does not send the uploaded operating data to the server when local parsing succeeds;
- uses the Python upload API only as a fallback for non-standard files or unsupported browser conditions;
- continues through alternative backend routes when an earlier route returns an incomplete legacy response;
- validates daily and monthly history before activation;
- preserves the last valid uploaded dataset after any failed attempt.

## Local start

Windows: run `run_local_server.bat`.

macOS/Linux:

```bash
./run_local_server.sh
```

The Python service remains recommended for the complete application, including AADT and location services. The calibration ZIP/XLSX upload itself is now browser-local and no longer depends on the backend version.

## Recommended upload

Upload the complete dashboard ZIP or `Daily_Charger_kWh.xlsx`. Selecting the complete Overview and Ignore file set together is also supported; only the canonical daily charger workbook is parsed as the primary history source.

## Tests

```bash
node tests/runTests.js
```

The suite covers syntax, browser-local ZIP/XLSX parsing, incomplete-backend route resilience, AADT, Python history parsing, maturity forecasting, API routes and static delivery.
