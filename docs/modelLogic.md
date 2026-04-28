# Model Logic

The workbook `Financial Modelling - EV Hub - DUT . V13.xlsx` is the modelling source of truth.

The app implements the workbook logic in modular JavaScript engines:

- `demandEngine.js` implements `Demand_Model`.
- `technicalEngine.js` implements `Summary` derived configuration checks and capex formulas.
- `financialEngine.js` implements `Year_by_Year`.
- `optimizerEngine.js` implements the six live Excel scenario configurations from `Scenario_Compare`.

## Exact-mode rules

The following rules are intentionally preserved from the Excel workbook:

- The MIC library is `50, 100, 200, 400, 800, 1000, 1500`.
- Revenue is based on delivered/served energy, not theoretical demand.
- Year-by-year outputs respect the selected horizon in dashboard summaries.
- Battery replacement uses SOH, not SOC.
- Charger replacement is triggered by the selected charger replacement cycle.
- Landlord GP share and gross-sales share are both applied if both Excel inputs are non-zero.
- Scenario Compare uses the six Excel live configurations, not arbitrary invented equipment options.

## App-only additions

The following are not financial-model inventions; they are product/UI additions:

- Address/Eircode search.
- Map display.
- Nearby charger card rendering and filters.
- Provider diagnostics.
- Manual AADT override.
- CSV/JSON/printable exports.
