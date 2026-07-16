# V21 production validation

Validation date: 16 July 2026  
Build: `EVHUB-V21-20260716-R1`

## Automated regression suite

`npm test` completed successfully and covered:

- Python compilation and JavaScript syntax checks;
- build/schema/parser identity guards;
- Portfolio Financials rendering and column guards;
- CAPEX variance bands and performance classifications;
- history-quality separation from performance status;
- daily and monthly upload-history requirements;
- 18 AADT regression cases;
- live financial-history parser regressions;
- maturity-engine regression cases;
- local `/api/version` and `/api/health` responses; and
- static application delivery.

## Real uploaded-data validation

The supplied `Funded_Overview_Data_14_07_26.zip` was parsed with the V21 backend.

- Latest actual-data date: 13 July 2026
- Uploaded sites parsed: 47
- Sites with daily history: 47
- Site-day observations retained: 12,009
- Sites with monthly history: 47
- Monthly observations: 444
- Complete monthly observations: 361
- Active portfolio sites: 37
- Active portfolio sites matched: 37
- Missing active-site histories: 0
- Minimum source-date coverage across parsed sites: 100%

## Browser workflow smoke test

A bundled real-application browser harness loaded the actual frontend modules and the real parsed upload response.

Validated:

- all ten application tabs rendering with substantive content;
- 37 Portfolio Financial Performance rows before and after upload;
- uploaded actuals active for 37 of 37 active sites;
- Energy & network cell rendering with energy rate, standing and capacity components;
- active electricity-cost propagation from €0.250/kWh to €0.300/kWh, with energy cost increasing from €18,521 to €22,225 while standing/capacity remained €11,127;
- forecast modal launch from Next 12m kWh;
- rolling 30-day, daily and monthly chart modes;
- monthly forecast audit table and calculation KPIs;
- funding modal launch from CAPEX;
- known funding amount, apply control and saved table state;
- ten primary table columns retained;
- mobile forecast-modal width within the viewport;
- no browser console errors; and
- no unhandled page errors; and
- a functional Portfolio Financials Excel download (85,083 bytes).

## Export validation

The downloaded Excel workbook was reopened and inspected. It contained three sheets: `Portfolio Summary`, `Portfolio Financials` and `Definitions`. The financial matrix contained the new funding, net invested CAPEX, electricity, DUoS standing/capacity and gross/net payback fields. A formula-error scan found no `#REF!`, `#DIV/0!`, `#VALUE!`, `#NAME?` or `#N/A` entries.

## Financial integrity checks

- Gross CAPEX variance remains model day-one CAPEX versus gross actual day-one CAPEX.
- Funding affects only net invested CAPEX, effective payback and projected returns when applied.
- EBITDA uses revenue minus electricity energy, standing/capacity and other OPEX.
- Other OPEX excludes electricity and network charges.
- Forecast chart values and the matrix Next 12m total use the same forecast result.

## Residual operating note

Forecast reliability still depends on the quality and recency of the uploaded source data. Sites without enough complete history use a neutral site trend and portfolio seasonality rather than an unsupported site-specific extrapolation; the audit panel identifies the available history and applied method.
