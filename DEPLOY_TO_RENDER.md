# Hosted deployment — V21.2

Deploy the complete package with the service start command:

```bash
python server.py
```

The following must remain together at the deployment root: `server.py`, `index.html`, `js/`, `assets/`, `data/`, `DEPLOYMENT_MANIFEST.json`, `requirements.txt`, `render.yaml` and `Procfile`.

V21.2 no longer blocks the data upload merely because `/api/version` is unavailable. It discovers relative and root API routes and validates the actual upload response. The hosting platform must still forward POST requests for an `api/import-live-calibration` route to `server.py`; static-only hosting cannot parse Excel/ZIP uploads.

Expected metadata when the diagnostic route is available:

- `appVersion`: `V21.2`
- `buildId`: `EVHUB-V21.2-20260718-R1`
- `uploadSchemaVersion`: `v21-live-history-v7`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.3`
