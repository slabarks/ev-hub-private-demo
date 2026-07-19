# Hosted deployment — V21.3

Deploy the complete package with:

```bash
python server.py
```

Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `DEPLOYMENT_MANIFEST.json`, `requirements.txt`, `render.yaml` and `Procfile` together at the deployment root.

The calibration upload is parsed in the browser first. Therefore, an older, missing or incompatible upload endpoint no longer prevents `Daily_Charger_kWh.xlsx` or the standard dashboard ZIP from activating daily and monthly histories. The Python service is still required for the full hosted application and its server-backed AADT/location functions.

Expected diagnostic metadata:

- `appVersion`: `V21.3`
- `buildId`: `EVHUB-V21.3-20260719-R1`
- `uploadSchemaVersion`: `v21-live-history-v7`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.4`
