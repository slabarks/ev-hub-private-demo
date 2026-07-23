# V21.8 release notes — Portfolio Electricity Pricing

## Release basis

V21.8 is built from V21.7 and preserves the approved V21.5 visual baseline. No new permanent table column has been introduced.

## Portfolio-wide electricity price

`Manage portfolio terms` now contains an **Electricity purchase price** section.

- Exact portfolio price input in EUR/kWh ex VAT.
- Precision to four decimal places.
- Existing site overrides remain unchanged when the portfolio price changes.
- Reset portfolio price to the active model default.
- Remove every site override in one action.
- Summary shows the number of sites using the portfolio price, the number of overrides and the next-12-month kWh-weighted average effective price.

## Site-specific electricity price

The Energy card in Site Financial Performance is now interactive.

- Click Energy to open the site electricity-price window.
- Select portfolio price or exact site-specific override.
- Optional source/note field.
- Live preview of effective EUR/kWh and next-12-month energy cost.
- The Energy card identifies a saved site override without adding another column.

## Calculation propagation

The effective site electricity price is applied consistently to:

- current annual energy purchase cost;
- next-12-month energy purchase cost;
- site EBITDA;
- run-rate and long-term payback;
- P25/P50/P75 operating cashflow ranges;
- selectable 1–20-year portfolio projections;
- portfolio totals and weighted-average electricity price;
- Excel and PDF-ready export data.

The price does not change delivered kWh, sessions, revenue, DUoS standing charge or MIC capacity charge.

## Precedence and persistence

Calculation precedence is:

1. Site override, where enabled.
2. Portfolio electricity price.
3. Active model electricity-cost default when no portfolio value has been saved.

Global and site values persist in application local storage and are removed by the existing confirmed logo reset.

## Existing V21.7 corrections retained

- Commercial-operation date detection and Corrib Oil Swinford commissioning-prefix exclusion.
- Semantic run-rate payback sorting.
- Confirmed full-application logo reset.
- `Smoothed history — visual guide` forecast wording.
