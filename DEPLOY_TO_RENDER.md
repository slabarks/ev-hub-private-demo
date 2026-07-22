# Hosted deployment — V21.7

Deploy the complete extracted V21.7 package as one application. Do not merge selected frontend files into an older release.

## Start command

```bash
python server.py
```

## Required root files

```text
server.py
index.html
DEPLOYMENT_MANIFEST.json
js/
assets/
data/
```

## Verification

Open `/api/version` on the deployed application domain. It should report:

- `appVersion`: `V21.7`
- `buildId`: `EVHUB-V21.7-20260722-R1`
- `parserBuildId`: `EVHUB-LIVE-PARSER-21.7`
- `deploymentRootOk`: `true`

After deployment, perform one hard refresh or use the ePower-logo reset action.
