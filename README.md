# EV Charging Hub Investment Tool — V17.39 Lean Production Build

V17.39 is the production package for the revised Portfolio Financials logic and rendering.

## Portfolio Financials basis
- **Day-one CAPEX:** actual as-built CAPEX versus the complete modelled day-one build.
- **Next 12 months:** actual site trajectory, bounded trend, seasonality, traffic growth and tariff.
- **Maturity:** applied only from month 13 in 5/10/15/20-year projections.
- **OPEX:** one forward value excluding electricity.
- **Electricity:** separate forward value.
- **Site EBITDA:** revenue minus electricity minus OPEX.
- **Run-rate payback:** actual day-one CAPEX divided by next-12-month site EBITDA.

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
- `RELEASE_NOTES_V17.39_FORWARD_FINANCIALS.md`
- `V17.39_PRODUCTION_VALIDATION.md`
