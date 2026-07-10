# V17.37 — Portfolio Financial Maturity Forecast

## Release purpose

V17.37 strengthens the investor-facing Portfolio Financials tab by replacing the former flat annual growth treatment with a monthly maturity-aware forecast and by introducing explicit CAPEX model-accuracy bands.

## Implemented changes

### CAPEX

- Absolute CAPEX delta ≤ €30,000: green.
- Absolute CAPEX delta > €30,000 and ≤ €50,000: amber.
- Absolute CAPEX delta > €50,000: red.
- Overspend/underspend direction remains visible.
- Portfolio dashboard reports the count of sites in each accuracy band.
- PDF and Excel exports include the CAPEX accuracy band and signed explanation.

### Live data and maturity learning

- The daily charger upload parser retains monthly site histories.
- Months are indexed from the first real commercial session, falling back to first meaningful kWh.
- Zero-demand days remain in the calendar denominator rather than being silently removed.
- Sites with 365+ days and at least ten usable monthly observations become maturity-training candidates.
- Stable late-stage sites are preferred when at least three are available.
- A 365+ day site with material recent growth is identified as **late ramp** rather than assumed mature because of age alone.
- Late-ramp sites are aligned to an implied maturity position using observed trend and calibrated mature demand, and their confidence is capped below High.
- Seasonality is learned from later-stage mature observations.
- The maturity curve uses site-normalised cohort evidence, P25/P50/P75 bands, conservative prior shrinkage and monotonic smoothing.
- Leave-one-site-out back-testing reports month-3, month-6 and month-9 plateau-estimation errors.

### Revenue and profitability

- Early-site mature potential blends observed performance with the calibrated site demand model using history-dependent credibility weights.
- kWh growth and net realised €/kWh are forecast separately.
- The monthly forecast includes maturity progression, seasonality, traffic growth and tariff escalation.
- Electricity cost escalation is applied separately to monthly EBITDA and payback.
- Partial-period actual revenue informs realised €/kWh without being labelled as T12M actual revenue.
- Next-12-month revenue, downside/upside range, mature revenue, maturity %, confidence, OPEX, EBITDA and payback are shown per site.
- Portfolio 5/10/15/20-year revenue and EBITDA now aggregate the monthly site forecasts.

### Production safeguards

- If mature cohort evidence is insufficient, a conservative prior is used and clearly labelled.
- Payback is withheld for sites with fewer than 30 commercial operating days.
- Payback uses cumulative forecast cash flow and is capped at a 20-year forecast horizon.
- Maturity-model cache invalidation includes monthly-history content, not only history length.
- Existing audited AADT safeguards remain unchanged.

## Required data

The static portfolio data contains current run rates but not the historical monthly path needed to learn an empirical curve. Upload the normal charger-level daily export to activate cohort learning. No additional source format is required.
