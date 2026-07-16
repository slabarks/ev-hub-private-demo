# Render deployment — V21

1. Replace the complete deployed application with the contents of `EV Charging Hub Investment Tool - Production Ready V.21.zip`. Do not merge files into an older deployment.
2. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.
3. Build command: `python -m py_compile server.py`
4. Start command: `python server.py`
5. Health path: `/api/health`

Expected build metadata:

- `buildId`: `EVHUB-V21-20260716-R1`
- `uploadSchemaVersion`: `v21-live-history-v7`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.1`
- `packageLayoutVersion`: `flat-root-v1`
- `dailyHistorySupported`: `true`
- `monthlyHistorySupported`: `true`

## Deployment verification

After deployment:

1. Open `/api/health` and confirm HTTP 200.
2. Open `/api/version` and confirm the V21 metadata above.
3. Hard-refresh the browser once after replacing the deployment.
4. Upload the complete overview ZIP or `Daily_Charger_kWh.xlsx`.
5. Confirm the live-calibration card reports uploaded actuals active and shows daily and monthly histories.
6. In Portfolio Financial Performance, click a **Next 12m kWh** value and confirm the rolling 30-day graph, chart-mode controls and 12-month audit table render.
7. Confirm the **Energy & network** column separates electricity from standing/capacity charges.
8. Click a site's CAPEX and confirm the funding panel can apply and remove funding without changing gross CAPEX variance.

The application retains `/api/import-live-calibration-v1745` as the preferred upload route for compatibility with existing deployment routing. The response must still pass V21 daily/monthly content validation before it becomes active.
