# Render deployment — V17.42 flat-root package

This release must be deployed as a complete root-level application. The ZIP intentionally has no outer wrapper folder.

## Clean deployment procedure

1. Delete the old repository contents or create a fresh private repository.
2. Extract `EVHub_V17_42_lean.zip`.
3. Upload everything extracted directly to the repository root. At the root you must see:
   - `server.py`
   - `index.html`
   - `DEPLOYMENT_MANIFEST.json`
   - `js/`
   - `assets/`
   - `data/`
4. In Render, use:
   - Environment: `Python`
   - Build command: `python -m py_compile server.py`
   - Start command: `python server.py`
   - Health-check path: `/api/health`
5. Set:
   - `DEMO_PASSWORD` as required
   - `SESSION_SECRET` or `DEMO_SESSION_SECRET` to a long random value
   - `DISABLE_BROWSER_OPEN=1`
6. Trigger **Clear build cache & deploy** or create a new service. A normal static-file merge is not sufficient.
7. Open `/api/health` and confirm:
   - build `EVHUB-V17.42-20260710-R1`
   - parser `EVHUB-LIVE-PARSER-17.42.1`
   - schema `v17.42-live-history-v3`
   - layout `flat-root-v1`
   - `deploymentRootOk: true`
   - `frontendBuildVerified: true`
8. Hard-refresh the browser, clear old uploaded actuals, then upload either the complete dashboard ZIP or `Daily_Charger_kWh.xlsx`.

## Why the clean deployment matters

The previous error occurred because the V17.41 browser files were served by an older Python process. V17.42 prevents an internally mixed package from starting and reports a clearly labelled deployment mismatch when the running server is still old.
