# EV Charging Hub Investment Tool — V21.2

V21.2 fixes the calibration-upload failure where the browser stopped on `/api/version` HTTP 404 even though the user had selected the correct ZIP or Excel data.

## Build

- Application: `V21.2`
- Build: `EVHUB-V21.2-20260718-R1`
- History schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.3`

## Upload behaviour

The Portfolio Financial Performance upload now:

- treats `/api/version` as an optional diagnostic rather than a mandatory blocker;
- discovers API routes relative to the application location and at the domain root;
- tries both current and legacy upload route names with a fresh multipart request each time;
- validates the returned daily and monthly histories directly before activation;
- accepts a structurally valid compatible payload even when an older backend does not report build metadata;
- still rejects an explicitly incompatible history schema or an incomplete history response;
- supports API routes behind a reverse-proxy subpath;
- preserves the last valid uploaded dataset after any failed attempt.

## Local start

Windows: run `run_local_server.bat`.

macOS/Linux:

```bash
./run_local_server.sh
```

The browser is opened only after the packaged Python backend has bound successfully. If port 10314 is occupied by a stale instance, the local launcher selects the next available port instead of opening the old application.

## Recommended upload

Upload the complete dashboard ZIP or `Daily_Charger_kWh.xlsx`. The parser opens the canonical daily charger file and does not unnecessarily parse the supporting Overview/Ignore workbooks.

## Tests

```bash
node tests/runTests.js
```

This runs syntax checks, AADT tests, history-parser tests, maturity-engine tests, root and prefixed API-route tests, upload smoke tests and static-delivery checks.
