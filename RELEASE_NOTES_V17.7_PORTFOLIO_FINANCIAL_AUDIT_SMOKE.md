# V17.7 Portfolio Financial audit smoke

- Added robust operational-days parsing for uploaded live actual rows where maturity.dataDays is zero but the annualisation method states days live.
- Keeps landlord GP share and gross-sales share defaults at zero.
- Portfolio Financials now treats missing operational-day metadata separately from short operating history.
- Added full audit checks for landlord default/precedence, OPEX identities, EBITDA identities, payback identities, missing CAPEX, estimated revenue, and portfolio summary totals.
