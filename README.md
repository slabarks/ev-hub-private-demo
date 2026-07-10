# EV Charging Hub Investment Tool — V17.42 Lean Production Build

V17.42 is a deployment and live-calibration hotfix built on the approved V17.41 investor-performance release.

## What is fixed

- The deployment ZIP is **flat-root**: `server.py`, `index.html`, `js/`, `assets/` and `data/` sit directly at the archive root.
- The Python server refuses to start when the manifest, frontend build markers or required root files do not match.
- `/api/version` and `/api/health` report the application build, parser build, upload schema, package-layout version, server fingerprint and deployment-root status.
- Deployment mismatches are shown as deployment errors, not misleading spreadsheet errors.
- The live-calibration importer accepts either individual Excel/CSV files or the complete dashboard ZIP pack.
- ZIP uploads are expanded safely; `Ignore` folders, hidden folders and unsupported files are skipped.
- Browser cache-busters were advanced so an older `app.js` cannot remain paired with a newer server after a normal redeployment.

## Build identity

- Application: `V17.42`
- Build: `EVHUB-V17.42-20260710-R1`
- Upload schema: `v17.42-live-history-v3`
- Parser: `EVHUB-LIVE-PARSER-17.42.1`
- Package layout: `flat-root-v1`

## Run locally

```bash
python server.py
```

Open `http://localhost:10314/`.

## Test

```bash
npm test
```

## Deploy

Deploy the **complete contents of this ZIP** as the application root. Do not place the files inside another folder and do not merge them over an older deployment.

Start command:

```bash
python server.py
```

After deployment, open:

```text
https://YOUR-APP-URL/api/health
```

The response must report:

- `buildId: EVHUB-V17.42-20260710-R1`
- `parserBuildId: EVHUB-LIVE-PARSER-17.42.1`
- `packageLayoutVersion: flat-root-v1`
- `deploymentRootOk: true`
- `frontendBuildVerified: true`
- `health: ok`

The calibration page can then accept either `Daily_Charger_kWh.xlsx`, the individual recommended Excel files, or the complete dashboard ZIP.

## Release documents

- `RELEASE_NOTES_V17.42_DEPLOYMENT_HOTFIX.md`
- `V17.42_PRODUCTION_VALIDATION.md`
