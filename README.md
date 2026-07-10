# EV Charging Hub Investment Tool — V17.41 Lean Production Build

This release refocuses **Portfolio Financials** on the information an investor needs: forward site performance against the calibrated model, day-one investment accuracy, next-12-month EBITDA and selectable long-term returns.

## Portfolio Financials

- **Day-one CAPEX:** actual as-built CAPEX versus the complete modelled day-one build. Replacements, later plugs and progressive CAPEX are excluded.
- **CAPEX direction:** negative CAPEX delta and delta percentage use red text; positive values use green text. The existing green/amber/red background continues to show the absolute model-accuracy band.
- **Next 12 months:** actual-led forecast based on observed run-rate, bounded trend, calendar seasonality and near-term growth. Maturity is excluded.
- **Performance versus model:** next-12-month forecast kWh compared with a calibrated benchmark for the same forward period and commercial age.
- **Performance bands:** above +15% is Above benchmark, below -15% is Underperforming and the range between is In benchmark. Low or missing history is displayed separately and never removes the calculated variance.
- **Financial outputs:** next-12-month net revenue, electricity, OPEX excluding electricity, site EBITDA and run-rate payback.
- **Projection horizon:** any whole year from 1 to 20, with one-year controls and 5/10/15/20-year shortcuts.
- **Long-term maturity:** applied only from month 13 and retained inside the collapsed Advanced forecast methodology audit.

## Uploaded-history integrity

The frontend and backend share a production build ID, upload-schema version and parser ID. The browser checks `/api/version` before accepting a live-data upload and rejects a mismatched or incomplete backend. The upload response also reports the server fingerprint, deployment-root status, matched monthly histories and retained monthly observations.

## Run locally

```bash
python server.py
```

Open `http://localhost:10314/`.

## Test

```bash
npm test
```

## Deployment

Deploy the **contents of this folder** together. The required root files are listed in `DEPLOYMENT_MANIFEST.json`, and the start command is:

```bash
python server.py
```

## Release documents

- `RELEASE_NOTES_V17.41_INVESTOR_PERFORMANCE.md`
- `V17.41_PRODUCTION_VALIDATION.md`
