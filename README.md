# EV Charging Hub Investment Tool — V17.46 Lean Production Build

V17.46 is a focused Portfolio Financials reliability and presentation release. It removes the deployment dependency that repeatedly prevented monthly live history from loading and replaces the fixed-width scrolling site table with a fit-to-width investor layout.

## Build identity

- Application: `V17.46`
- Build: `EVHUB-V17.46-20260711-R1`
- Upload schema: `v17.46-live-history-v7`
- Server parser: `EVHUB-LIVE-PARSER-17.46.1`
- Package layout: `flat-root-v1`

## Live calibration upload

Accepted inputs include:

- `Daily_Charger_kWh.xlsx`
- The Overview spreadsheet files selected together
- A complete ZIP pack such as `Funded_Overview_Data_10_07_26.zip`

The browser now starts a complete local parse of the selected XLSX/CSV/ZIP data while it also tries the Python import endpoint. A complete server response remains valid. When the hosted backend is older, unavailable, or returns a partial response without monthly histories, the browser uses the validated browser-parsed result instead.

The browser parser retains the same monthly-history contract used by the Python parser: site-level actuals, commercial start, operational days, rolling 30-day kWh, annualised actual basis and per-site monthly history.

A dataset is activated only after content validation. An incomplete parse does not replace the last valid live dataset.

## Performance versus model

Performance is based on the same comparison displayed in every site row:

`next-12-month actual-led forecast kWh ÷ model forward-12-month benchmark kWh`

- More than 15% above model: `Above benchmark`
- Within ±15%: `In benchmark`
- More than 15% below model: `Underperforming`
- Comparison unavailable: `Review`

History quality remains a separate note and never replaces the performance classification.

## Portfolio Financials table

The 10-column site table now fits the available desktop width rather than using a 1,650 px scrolling canvas.

- all 10 columns visible together on desktop
- no horizontal scrollbar
- explicit percentage column widths
- wider Site, Performance and Run-rate payback space
- sticky header and sticky Site column
- compact secondary text and reconciliation notes
- no faded early-operation rows
- under 1,180 px, rows become responsive labelled cards instead of forcing horizontal scroll

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
