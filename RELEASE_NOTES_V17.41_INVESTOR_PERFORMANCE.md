# V17.41 — Investor Performance Benchmark and Flexible Projection Horizon

## Investor view

- Removed the Portfolio maturity & forecast quality block from the default investor dashboard.
- Retained maturity diagnostics only in a collapsed **Advanced forecast methodology & audit** section.
- Replaced the Forecast confidence table column with **Performance vs model**.
- Restored the site-level comparison of next-12-month forecast kWh against the calibrated model benchmark for the same forward period.
- Displays the numerical performance variance even when history is limited; the history warning remains a separate note.
- Aligns the four performance cards with the site table: In benchmark, Underperforming, Above benchmark and Low / missing history.
- Separates CAPEX missing and no-positive-payback warnings from demand-performance status.

## CAPEX presentation

- CAPEX delta equals modelled complete day-one CAPEX minus actual day-one CAPEX.
- Negative CAPEX delta and CAPEX delta percentage are red.
- Positive CAPEX delta and CAPEX delta percentage are green.
- Zero remains neutral.
- Background accuracy bands remain based on absolute difference: up to €30k green, above €30k to €50k amber and above €50k red.

## Projection horizon

- Adds exact whole-year selection from 1 to 20 years.
- Includes a slider, one-year minus/plus controls, 5/10/15/20-year shortcuts and a compact mobile selector.
- Updates revenue, electricity, OPEX, EBITDA, net after CAPEX, profitability margin and portfolio payback for the selected horizon.
- Year 1 uses only the approved actual-led next-12-month forecast. Maturity begins from month 13.
- PDF and Excel exports use the active selected horizon.

## Upload and deployment integrity

- Application build: `EVHUB-V17.41-20260710-R1`.
- Upload schema: `v17.41-live-history-v2`.
- Parser build: `EVHUB-LIVE-PARSER-17.41.1`.
- Adds frontend/backend preflight validation before upload.
- Adds server file fingerprint and deployment-root validation.
- Rejects stale or mixed frontend/backend responses with the expected and actual build details.
- Clears incompatible cached live-upload snapshots.

## Table and exports

The primary site table now contains:

1. Site
2. Days
3. Day-one CAPEX
4. Next 12m kWh
5. Performance vs model
6. Next 12m revenue
7. Electricity
8. OPEX excl. electricity
9. Site EBITDA
10. Run-rate payback

PDF and Excel outputs include the model benchmark, variance, performance classification and separate data-quality note. Forecast confidence is no longer a headline investor field.
