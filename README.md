# EV Charging Hub Investment Tool — V21.1

V21.1 hardens the live-calibration upload workflow and corrects the Portfolio Financial Performance table layout, while retaining the V21 forecast-audit, electricity/network-cost and funding functionality.

## Build identity

- Application: `V21.1`
- Build: `EVHUB-V21.1-20260717-R1`
- Upload schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.2`
- Package layout: `flat-root-v1`

## Live calibration upload

The recommended source is the complete dashboard ZIP or `Daily_Charger_kWh.xlsx`. The daily charger file is the authoritative forecasting input because it contains charger-day kWh, sessions and net revenue.

V21.1 improves the workflow as follows:

1. Performs a strict `/api/version` check before uploading, so an old or partially deployed backend is rejected immediately.
2. Selects the canonical `Daily_Charger_kWh` file first and does not open unrelated supporting workbooks when the canonical source exists.
3. Accepts the complete ZIP, the Overview files, or Overview and Ignore files selected together without repeatedly parsing every workbook.
4. Applies browser timeouts to backend preflight and upload requests instead of leaving the interface loading indefinitely.
5. Reads the response as text before JSON parsing and distinguishes JSON, HTML login/session responses, gateway errors, truncated responses and deployment mismatches.
6. Uses a fresh multipart request when the compatibility upload route must fall back to the standard route.
7. Compresses large JSON responses with gzip and exposes request/parser timing through `Server-Timing` and response metadata.
8. Shows staged progress and preserves the last valid calibration dataset when a new upload fails validation.

A daily-file upload is activated only when the backend returns both continuous daily history and monthly history under the expected V21 schema.

## Historical forecasting and Next 12m kWh

The parser:

- maps charger records to their parent site;
- aggregates all chargers at each site by date;
- establishes commercial start from the first real session, otherwise the first day with at least 1 kWh;
- retains zero-utilisation calendar days within the operating period;
- uses each site's own latest source date;
- calculates rolling 30-day kWh and monthly observations; and
- supplies the same forecast dataset to the matrix and audit graph.

Clicking **Next 12m kWh** opens an audit panel with rolling-30-day, daily and monthly views, actual history, smoothed historical trend, controlled forward forecast, data cut-off, forecast factors and a monthly reconciliation to the matrix total.

## Portfolio Financial Performance layout

The previous build forced the financial table to 1,650 px inside a narrower application canvas and generated a duplicate top scrollbar. V21.1 removes the generated top scrollbar and uses a fluid ten-column table on desktop.

- At desktop and normal laptop widths, all ten columns fit in one view with no horizontal scrollbar.
- At narrow widths below 1,280 px, one controlled bottom scrollbar is retained so text is not compressed into an unreadable layout.
- The first column becomes sticky only in the narrow scrolling mode.

## Electricity and network-cost visibility

The **Energy & network** column separates:

- electricity energy purchase cost and unit rate;
- DUoS standing charge; and
- MIC-linked capacity charge.

Other OPEX excludes electricity and network charges. EBITDA reconciles as:

`Revenue − electricity energy − standing/capacity − other OPEX`

## Funding and net invested CAPEX

Clicking day-one CAPEX opens the funding panel. The user can apply, exclude, override or reset known site funding. Funding changes net invested CAPEX, effective payback and projected returns, while gross actual CAPEX and gross model-versus-actual CAPEX variance remain unchanged.

## Run locally

```bash
python server.py
```

Open the URL printed by the server.

## Test suite

```bash
npm test
```

The suite checks Python and JavaScript syntax, deployment identity, upload-schema integrity, parser optimisation, gzip/timing headers, Portfolio Financials rendering guards, AADT regressions, historical forecast logic, API health and static delivery.

## Production deployment

Replace the full deployed package; do not merge selected V21.1 files into an older build. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `tests/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.

Start command: `python server.py`  
Health path: `/api/health`  
Version path: `/api/version`
