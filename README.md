# EV Charging Hub Investment Tool — V21

V21 strengthens the Portfolio Financial Performance workflow around three investor-critical areas: an auditable actual-led 12-month energy forecast, a visible split of electricity and network charges, and site-level funding controls that preserve gross CAPEX accuracy while calculating net invested capital.

## Build identity

- Application: `V21`
- Build: `EVHUB-V21-20260716-R1`
- Upload schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.1`
- Package layout: `flat-root-v1`

## Live calibration upload

The application accepts Excel, CSV or ZIP dashboard exports. `Daily_Charger_kWh.xlsx` is the primary source for site-level historical forecasting because it provides charger-day energy, sessions and net revenue.

When a daily charger file is present, the backend must return both:

- continuous site-level daily history; and
- site-level monthly history.

If either history is missing, the new upload is rejected and the last valid live dataset remains active. This prevents an incomplete backend response from silently replacing valid history.

The parser:

1. maps charger records to their parent site;
2. aggregates all chargers at each site by date;
3. establishes commercial start from the first real session, otherwise the first day with at least 1 kWh;
4. retains zero-utilisation calendar days within the operating period;
5. calculates rolling 30-day kWh and complete monthly observations; and
6. uses each site's own latest source date, so a site is not incorrectly extended to the portfolio-wide latest date.

The existing upload route `/api/import-live-calibration-v1745` is retained for deployment compatibility. Returned content is validated against the V21 daily/monthly schema before activation.

## Next 12-month kWh forecast

The Portfolio Financial Performance forecast now uses all usable uploaded history while applying safeguards appropriate to the site's maturity.

- Mature sites are anchored primarily to trailing-365 actual performance.
- Younger sites use cumulative actual performance and recent daily/monthly run-rate.
- Recent signals are derived from complete daily history and seasonally adjusted monthly observations.
- A site trend is applied only when at least six sufficiently complete months and at least 90 operating days are available.
- Trend rates are bounded and decay through the forward period.
- Recent performance weighting was reduced for mature sites to avoid counting recent weakness twice through both the base run-rate and a second aggressive trend.
- Site seasonality is used only when supported; otherwise portfolio seasonality is used.
- The first forecast year remains actual-led and does not include a hidden maturity uplift.

Clicking any **Next 12m kWh** value opens an audit panel containing:

- rolling 30-day actual kWh;
- daily and monthly chart modes;
- a smoothed historical trend;
- the controlled 12-month model forecast;
- exact actual period, operating days and cumulative kWh;
- annual, recent and blended run-rate components;
- trend, seasonality and growth assumptions; and
- the 12 monthly forecast values that reconcile to the matrix total.

The historical fitted trend is descriptive. The controlled forecast line, rather than an unconstrained polynomial extension, is the value used in the financial model.

## Electricity and network-cost visibility

The Portfolio Financial Performance matrix contains a compact **Energy & network** column showing:

- electricity energy purchase cost and the unit rate used;
- DUoS standing charge;
- MIC-linked capacity charge; and
- combined standing and capacity cost.

**Other OPEX** excludes electricity and network charges, so EBITDA reconciles as:

`Revenue − electricity energy − standing/capacity − other OPEX`

Portfolio Financials now starts from the active model inputs rather than an isolated set of defaults, improving assumption propagation.

## Funding and net invested CAPEX

Clicking a site's day-one CAPEX opens a CAPEX and funding panel. Where the known database contains a funding match, the panel shows the amount, scheme, source and confidence.

The user may:

- apply or exclude the matched funding amount;
- enter a site-specific override; and
- reset the site to the database match.

Applying funding changes net invested CAPEX, payback and projected returns. It does not change gross actual CAPEX, model day-one CAPEX or the gross CAPEX variance comparison.

Both gross and net payback are retained for transparency.

## Exports

Portfolio Financials Excel and PDF exports include:

- funding available, funding applied and net invested CAPEX;
- electricity energy cost and unit rate;
- DUoS standing and capacity charges;
- other OPEX excluding energy/network; and
- gross, net and effective payback fields.

## Run locally

```bash
python server.py
```

Open the local URL printed by the server.

## Test suite

```bash
npm test
```

The suite validates Python and JavaScript syntax, static production guards, AADT regression cases, live-history parsing, maturity forecasting, local API metadata, health checks and static delivery. V21 was also exercised with the supplied funded overview ZIP in a headless browser across desktop and mobile forecast/funding workflows.

## Production deployment

Deploy the complete package as a replacement, not as a merge into an older build. Keep `server.py`, `index.html`, `js/`, `assets/`, `data/`, `tests/`, `render.yaml` and `DEPLOYMENT_MANIFEST.json` directly at the service root.

Start command:

```text
python server.py
```

Health path: `/api/health`
