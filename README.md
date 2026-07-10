# EV Charging Hub Investment Tool — V17.40 Lean Production Build

V17.40 strengthens the **Portfolio Financials** tab and fixes the uploaded monthly-history linkage used by forecast confidence and long-term maturity modelling.

## Financial basis
- **Day-one CAPEX:** actual as-built CAPEX versus the complete modelled day-one build.
- **Next 12 months:** observed site run-rate, bounded short-term trend, seasonality, traffic growth and tariff.
- **Maturity:** excluded from year 1 and used only from month 13 in the 5/10/15/20-year projections.
- **OPEX:** one next-12-month value excluding electricity.
- **Electricity:** shown separately.
- **Site EBITDA:** revenue minus electricity minus OPEX.
- **Run-rate payback:** actual day-one CAPEX divided by next-12-month site EBITDA.

## V17.40 investor maturity view
The previous duplicated maturity diagnostics have been replaced by one investor-oriented section showing:
- revenue-weighted portfolio maturity,
- empirically mature versus ramping sites,
- remaining annual revenue uplift,
- remaining annual site-EBITDA uplift,
- typical time to steady state,
- long-term forecast confidence,
- selected-horizon revenue and EBITDA ranges.

Technical training-site, coverage, back-test and curve details remain available in an expandable audit section.

## Uploaded-history protection
- New upload schema: `v17.40-live-history-v1`.
- Old cached snapshots are cleared automatically.
- A daily charger upload returning zero monthly histories is rejected rather than silently shown as valid.
- The upload card now reports matched sites, sites with active monthly histories, retained monthly observations and schema version.
- A per-site uploaded-history mapping audit is available in the app.

## Run locally
```bash
python server.py
```
Open `http://localhost:10314/`.

## Test
```bash
npm test
```

## Release documents
- `RELEASE_NOTES_V17.40_INVESTOR_MATURITY.md`
- `V17.40_PRODUCTION_VALIDATION.md`
