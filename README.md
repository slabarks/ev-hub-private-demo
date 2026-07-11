# EV Charging Hub Investment Tool — V17.45 Lean Production Build

V17.45 is a focused Portfolio Financials correction release. It restores strict live-history integrity after upload, reconciles the portfolio performance summary with the site-level badges, and replaces the conflicting financial-table CSS with one canonical layout.

## Build identity

- Application: `V17.45`
- Build: `EVHUB-V17.45-20260711-R1`
- Upload schema: `v17.45-live-history-v6`
- Parser: `EVHUB-LIVE-PARSER-17.45.1`
- Package layout: `flat-root-v1`

## Live calibration upload

The browser uploads the selected Excel/CSV files or ZIP pack first and validates the parsed response content afterwards.

Accepted inputs include:

- `Daily_Charger_kWh.xlsx`
- Multiple dashboard exports selected together
- A complete dashboard ZIP pack such as `Funded_Overview_Data_10_07_26.zip`

When a daily charger file is present, zero returned monthly histories is treated as an incomplete backend response. The new upload is rejected and the last valid live dataset remains active. A missing backend build ID by itself does not block otherwise valid parsed data.

The preferred endpoint is `/api/import-live-calibration-v1745`; the browser may fall back to the legacy route only when the new route is unavailable. Returned data must still pass the V17.45 content checks.

## Portfolio performance logic

Performance status is always based on the same forward comparison shown in each site row:

`next-12-month actual-led forecast kWh ÷ model forward-12-month benchmark kWh`

- More than 15% above model: `Above benchmark`
- Within ±15%: `In benchmark`
- More than 15% below model: `Underperforming`
- Comparison unavailable: `Review`

History quality is separate. Early or limited data can add a concise note, but it never replaces the numerical variance or the Above / In / Under benchmark classification.

## Financial table rendering

The Portfolio Financials table uses one canonical V17.45 layout:

- 10 fixed columns and explicit widths
- 1,650 px table canvas with horizontal scrolling
- sticky header and sticky Site column
- synchronized top and standard bottom scrolling
- wider Performance and Run-rate payback columns
- no faded early-site rows
- no duplicate CAPEX/payback messages
- concise EBITDA reconciliation in-cell, with full values retained in the tooltip

## Run locally

```bash
python server.py
```

Then open the local URL printed by the server.

## Production deployment

Deploy the ZIP contents at the service root. `server.py`, `index.html`, `js/`, `assets/`, `data/` and `DEPLOYMENT_MANIFEST.json` must remain at that root.

Start command:

```text
python server.py
```

Health path: `/api/health`
