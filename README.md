# EV Charging Hub Investment Tool — V21.5

V21.5 removes the calibration upload's dependency on a matching backend response. The selected `Daily_Charger_kWh.xlsx` or dashboard ZIP is now parsed directly in the browser first, including the complete daily and monthly histories required by Portfolio Financial Performance.

## Build

- Application: `V21.5`
- Build: `EVHUB-V21.5-20260719-R1`
- History schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.5`

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

## Portfolio Financial Performance board update

V21.5 also adds the agreed investor-facing controls and comparisons:

- portfolio-wide landlord and funding management from the main table header;
- exact whole-euro funding inputs and bulk funding actions;
- board-standard CAPEX variance direction (actual minus model);
- compact two-card forecast and actual-evidence presentation;
- compact two-card historical actual versus age-matched model presentation;
- consistent investor terminology across table, filters and PDF exports;
- confirmed SuperValu Tipperary LDV3 funding eligibility;
- stored snapshot date visibility; and
- simplified MIC transparency in network charges.

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
