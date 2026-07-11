# Render deployment — V17.46

1. Replace the complete deployed application with the contents of `EVHub_V17_46_lean.zip`; do not merge it into an older build.
2. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.
3. Build command: `python -m py_compile server.py`
4. Start command: `python server.py`
5. Health path: `/api/health`

Expected build metadata:

- `buildId`: `EVHUB-V17.46-20260711-R1`
- `uploadSchemaVersion`: `v17.46-live-history-v7`
- `parserBuildId`: `EVHUB-LIVE-PARSER-17.46.1`
- `packageLayoutVersion`: `flat-root-v1`

## Live upload behaviour

V17.46 no longer depends on a newly deployed Python parser to recover monthly live history. The browser parses the selected Excel/CSV files or ZIP pack locally in parallel with the server request.

- A complete Python response may be used directly.
- An older or incomplete backend response does not block the selected files.
- The browser-parsed result is used when it passes the same live-history content validation.
- A partial dataset cannot replace the last valid live dataset.

The preferred server endpoint remains `/api/import-live-calibration-v1746`.

V17.46 uses the cache identifier `17.46-browser-parser-fit-table-20260711-r1`.
