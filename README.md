# EV Charging Hub Investment Tool — V17.37 Lean Production Build

This is the production deployment package for **V17.37**.

V17.37 retains the audited V17.36 AADT resolver and upgrades the **Portfolio Financials** tab with CAPEX accuracy bands and maturity-adjusted revenue, EBITDA and payback forecasting.

## Portfolio Financials improvements

### CAPEX accuracy bands

The site-level CAPEX delta uses the absolute difference between model CAPEX and actual CAPEX:

- **Green:** absolute delta up to and including €30,000
- **Amber:** absolute delta above €30,000 and up to and including €50,000
- **Red:** absolute delta above €50,000

The sign remains visible as **underspend** or **overspend**. The colour measures model accuracy, not whether the financial direction is favourable.

### Maturity-adjusted revenue projection

The live-data importer now retains a compact monthly history for every mapped site. The Financials engine:

1. Identifies sites with at least 365 commercial operating days and usable monthly history.
2. Prefers mature sites whose late-stage demand has stabilised.
3. Adjusts monthly demand for portfolio seasonality.
4. Normalises each mature site against its late-stage plateau.
5. Learns downside, base and upside maturity paths using cohort quantiles, conservative prior shrinkage and monotonic smoothing.
6. Back-tests mature-site forecasts from months 3, 6 and 9 using leave-one-site-out validation.
7. Detects 365+ day sites that are still growing materially and treats them as late-ramp rather than mature by age alone.
8. Forecasts younger and late-ramp sites using a credibility-weighted blend of their observed trajectory and the site demand model.
9. Forecasts kWh and realised net price separately.
10. Calculates revenue, OPEX, electricity cost, EBITDA and cumulative payback month by month for up to 20 years.

When fewer than three suitable mature histories are available, the interface clearly reports that a conservative prior is active. Uploading the charger-level daily export activates empirical curve learning when the evidence threshold is met.

### Investor presentation

The Financials tab and exports now show:

- Current annual revenue basis
- Maturity-adjusted next-12-month revenue
- Downside/base/upside next-12-month range
- Expected mature annual revenue
- Current maturity percentage
- Months to 95% maturity
- Forecast confidence
- Maturity-adjusted next-12-month OPEX and EBITDA
- Cumulative monthly payback
- Portfolio maturity curve and back-test evidence

Partial-period uploaded revenue is used to derive realised €/kWh but is not mislabeled as an actual trailing-12-month result.

## AADT production behaviour retained

- Official TII counter locations are attempted first.
- The audited bundled fallback is used only when the official source is unavailable.
- Coarse description-derived geometry is ranking-only, never plotted, never blended and always requires review.
- Bandon and Kinsale use the reviewed N71 safeguards.
- Explicit route normalisation, coordinate validation and correct API error statuses remain active.

## Run locally

```bash
python server.py
```

Open `http://localhost:10314/`.

## Mandatory production test

```bash
npm test
```

A successful run ends with:

```text
PASS — V17.37 AADT, CAPEX bands, monthly history, maturity forecasting, exports, API and static smoke tests completed successfully.
```

## Deployment gate

Before production use, confirm:

- `/api/version` reports **V17.37**.
- `npm test` passes after clean extraction.
- The latest charger-level daily export is uploaded when an empirical maturity curve is required.
- The Financials maturity panel states whether the **Empirical curve** or **Conservative prior** is active.

See `RELEASE_NOTES_V17.37_FINANCIAL_MATURITY_FORECAST.md` and `V17.37_PRODUCTION_VALIDATION.md`.
