# Hosted deployment — V21.5

Deploy the complete extracted V21.5 package as one application. Do not merge selected frontend files into an older release.

## Start command

```bash
python server.py
```

The package includes the browser-local calibration parser, so the standard dashboard ZIP and `Daily_Charger_kWh.xlsx` upload remain available even if a hosting proxy cannot reach the upload API. The Python backend is still required for the complete location and AADT workflow.

## Required root layout

Keep these at the same deployment root:

- `server.py`
- `index.html`
- `DEPLOYMENT_MANIFEST.json`
- `assets/`
- `data/`
- `js/`

## Deployment verification

Open `/api/version` on the deployed domain. It should report:

- `appVersion`: `V21.5`
- `buildId`: `EVHUB-V21.5-20260719-R1`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.5`
- `deploymentRootOk`: `true`

After deployment, hard-refresh the browser once to replace cached assets from the previous release.
