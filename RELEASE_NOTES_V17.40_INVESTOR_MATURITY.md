# V17.40 — Investor Maturity and Uploaded-History Fix

## Summary
V17.40 keeps the V17.39 forward-12-month financial architecture, fixes the monthly-history upload contract and replaces duplicated maturity diagnostics with a single investor-focused long-term value section.

## Uploaded-history correction
- Introduced browser/server schema `v17.40-live-history-v1`.
- Added server totals for sites with monthly history, total monthly observations and complete-month observations.
- Replaced the previous shared cache key with a V17.40-specific key and clears older V17.39/V35 snapshots.
- Rejects a `Daily_Charger_kWh` upload if the server returns zero monthly histories or the wrong schema.
- Copies monthly history into the merged site actual and live-diagnostics records.
- Invalidates the maturity-model cache after upload/reset.
- Added an upload dashboard showing monthly-history coverage and a per-site mapping audit.

## Investor maturity section
The previous “Maturity outlook” and “Maturity forecast summary” sections are consolidated into **Portfolio maturity & forecast quality**.

The main investor cards now show:
- revenue-weighted maturity,
- empirically mature and ramping sites,
- sites with insufficient history,
- remaining annual revenue uplift,
- remaining annual site-EBITDA uplift,
- typical time to steady state,
- long-term forecast confidence,
- selected-horizon revenue and EBITDA downside/base/upside ranges.

A site is labelled empirically mature only when it has:
- at least 365 operational days,
- at least 10 monthly observations,
- no active late-ramp flag,
- stable recent monthly performance within the defined tolerance.

## Forecast separation retained
- The next 12 months remain independent of the maturity curve.
- Maturity begins only from month 13 in the 5/10/15/20-year forecast.
- Next-12-month revenue, electricity, OPEX and EBITDA remain one consistent forward comparison across all sites.

## Exports
- PDF export includes the investor maturity and forecast-quality window.
- Excel export now includes:
  - Portfolio Summary,
  - Portfolio Financials,
  - Definitions.

## Validation
- Full automated regression and deployment smoke test passed.
- Exact user upload pack validated separately:
  - 45 parsed uploaded sites,
  - 37/37 active known sites matched,
  - 340 monthly observations attached to the 37 active known sites,
  - empirical maturity model activated with 5 training sites,
  - expected next-12-month confidence distribution: 10 High, 12 Medium, 12 Medium-low and 3 Low.
