# EV Charging Hub Investment Tool — V17.44 Lean Production Build

V17.44 restores the reliable calibration-upload workflow while retaining the approved Portfolio Financial Performance changes from V17.43.

## Build identity

- Application: `V17.44`
- Build: `EVHUB-V17.44-20260710-R1`
- Upload schema: `v17.44-live-history-v5`
- Parser: `EVHUB-LIVE-PARSER-17.44.1`
- Package layout: flat root

## Calibration upload behaviour

The browser now uploads the selected Excel files or ZIP pack directly to `/api/import-live-calibration` and validates the returned site data. A missing or older backend build ID is diagnostic only and cannot block a valid upload.

Accepted inputs:

- `Daily_Charger_kWh.xlsx`
- Multiple dashboard Excel/CSV exports selected together
- Complete dashboard ZIP pack, including `Funded_Overview_Data_10_07_26.zip`

The app still rejects responses that contain no usable site actuals and prevents cumulative/running-total exports from becoming the primary daily source.

## Deployment reliability changes

- Unique V17.44 cache-busters are applied to `app.js` and `styles.css`.
- Package-integrity diagnostics no longer terminate the Python server.
- `/api/health` remains available but returns HTTP 200 with warnings rather than causing the hosting platform to retain an older deployment.
- Backend version metadata remains visible for audit but is no longer a prerequisite for uploads.

## Run locally

```bash
python server.py
```

Then open `http://localhost:10314/`.

## Production deployment

Deploy the ZIP contents at the service root and use:

```text
python server.py
```

The package contains `render.yaml` and `Procfile` for hosted deployment.
