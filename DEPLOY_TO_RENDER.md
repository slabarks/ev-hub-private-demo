# Hosted deployment — V21.6

Deploy the complete extracted V21.6 package as one application. Do not merge selected frontend or engine files into an older release because the financial, technical, export and UI changes are coordinated.

## Start command

```bash
python server.py
```

The browser-local calibration parser handles the standard dashboard ZIP and `Daily_Charger_kWh.xlsx`. The Python backend remains required for the complete location, AADT and upload-fallback workflow.

## Required root layout

Keep these at the same deployment root:

- `server.py`
- `index.html`
- `DEPLOYMENT_MANIFEST.json`
- `assets/`
- `data/`
- `js/`

The deployment integrity check verifies the financial, technical, maturity and forecast-snapshot engines as part of the package.

## Deployment verification

Open `/api/version` on the deployed domain. It should report:

- `appVersion`: `V21.6`
- `buildId`: `EVHUB-V21.6-20260719-R1`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.6`
- `packageLayoutVersion`: `flat-root-v1`
- `deploymentRootOk`: `true`

After deployment, hard-refresh once to replace cached V21.5 assets. Then verify:

1. Investor and Analyst navigation modes load.
2. `/api/health` reports a healthy deployment.
3. A known-site AADT lookup returns candidates.
4. A live-history file activates daily and monthly observations.
5. Investment Case shows gross CAPEX, grant/operator funding, lease NPV and valid IRR behaviour.
