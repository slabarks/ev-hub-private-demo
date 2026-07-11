# Render deployment — V17.45

1. Replace the complete deployed application with the contents of `EVHub_V17_45_lean.zip`; do not merge it into an older build.
2. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.
3. Build command: `python -m py_compile server.py`
4. Start command: `python server.py`
5. Health path: `/api/health`

Expected build metadata:

- `buildId`: `EVHUB-V17.45-20260711-R1`
- `uploadSchemaVersion`: `v17.45-live-history-v6`
- `parserBuildId`: `EVHUB-LIVE-PARSER-17.45.1`
- `packageLayoutVersion`: `flat-root-v1`

The browser sends calibration files before applying compatibility diagnostics. A valid response is accepted only after the returned site actuals and monthly histories pass content validation. A daily charger upload returning zero monthly histories is rejected while the last valid live dataset remains active.

V17.45 uses a unique asset cache identifier and a dedicated preferred upload route, `/api/import-live-calibration-v1745`.
