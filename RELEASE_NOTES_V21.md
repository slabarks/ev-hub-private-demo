# V21 release notes

## Portfolio forecast audit

- Added continuous site-level daily histories generated from uploaded charger-day records.
- Added rolling 30-day delivered-kWh series for every parsed site.
- Added a clickable Next 12m kWh audit modal with rolling, daily and monthly chart modes.
- Added actual, smoothed trend and controlled forecast series with a visible forecast start.
- Added exact monthly forecast reconciliation and calculation-bridge KPIs.
- Changed daily-history construction to use each site's own latest source date.
- Tightened trend eligibility to sufficiently complete monthly observations.
- Reduced mature-site recent weighting and trend caps to avoid double-counting recent deterioration.

## Electricity and network costs

- Added a compact Energy & network matrix column.
- Separated electricity energy cost, DUoS standing charge and MIC capacity charge.
- Changed Other OPEX to exclude energy and network costs.
- Updated EBITDA descriptions and exports to reconcile the new split.
- Updated Portfolio Financials to inherit current active assumptions.

## Funding and CAPEX

- Added site-level funding match, override and apply/exclude controls.
- Added gross CAPEX, funding applied and net invested CAPEX views.
- Added gross and net payback calculations.
- Applied net invested CAPEX to projected returns only when the user enables funding.
- Preserved gross model-versus-actual CAPEX variance independently of funding.
- Added funding and net-CAPEX fields to Portfolio Financials Excel and PDF exports.

## User interface and rendering

- Kept the financial matrix at ten primary columns through compact grouped cost presentation.
- Added responsive forecast and funding modals.
- Added hover-based chart detail rather than permanent labels on every point.
- Retained sticky table navigation and responsive mobile modal sizing.

## Build identifiers

- Application: `V21`
- Build: `EVHUB-V21-20260716-R1`
- Schema: `v21-live-history-v7`
- Parser: `EVHUB-LIVE-PARSER-21.1`
