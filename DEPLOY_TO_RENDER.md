# Render deployment — V21.1

1. Replace the complete deployed application with the contents of `EV Charging Hub Investment Tool - Production Ready V.21.1.zip`. Do not merge the package into an older deployment.
2. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `tests/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.
3. Build command: `python -m py_compile server.py`
4. Start command: `python server.py`
5. Health path: `/api/health`

Expected metadata from `/api/version`:

- `appVersion`: `V21.1`
- `buildId`: `EVHUB-V21.1-20260717-R1`
- `uploadSchemaVersion`: `v21-live-history-v7`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.2`
- `packageLayoutVersion`: `flat-root-v1`
- `dailyHistorySupported`: `true`
- `monthlyHistorySupported`: `true`
- `frontendBuildVerified`: `true`

## Deployment verification

1. Open `/api/health` and confirm HTTP 200.
2. Open `/api/version` and confirm the V21.1 metadata above.
3. Hard-refresh the browser after deployment so the V21 cache-busted JavaScript and CSS cannot remain active.
4. Confirm the Portfolio Financial Performance table has no duplicate top scrollbar at normal desktop/laptop widths.
5. Upload the complete overview ZIP. The progress state should complete rather than remain indefinitely on “Uploading and validating”.
6. Confirm the live-calibration card reports 37/37 matched active sites and active daily/monthly histories for the supplied 14 July 2026 dataset.
7. Click **Next 12m kWh** and confirm the rolling-30-day graph and monthly audit table render.
8. Confirm the **Energy & network** column separates energy from standing/capacity costs.
9. Click CAPEX and confirm funding can be applied or removed without changing gross CAPEX variance.

The browser performs a strict compatibility check before upload. If the frontend and backend are from different builds, the upload is stopped with a deployment-mismatch message instead of attempting to activate an incomplete response.
