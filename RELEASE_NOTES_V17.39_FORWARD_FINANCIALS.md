# V17.39 — Portfolio Financials Forward-12-Month Release

## Summary
V17.39 rebuilds the Portfolio Financials comparison around one consistent investor period: the next 12 months from the latest actual-data date.

## Financial logic
- Next-12-month revenue now uses observed site run-rate, bounded recent trend, calendar seasonality, near-term traffic growth and net tariff.
- Mature-state demand is excluded from the first 12 months.
- The maturity curve begins only from month 13 in the 5/10/15/20-year projections.
- Next-12-month OPEX is shown once and excludes electricity.
- Electricity cost is shown separately.
- Site EBITDA is reconciled as revenue minus electricity minus OPEX.
- Main-table payback is run-rate payback: actual day-one CAPEX divided by next-12-month site EBITDA.

## CAPEX comparison
- Actual project CAPEX is compared against the complete modelled day-one build.
- Future charger replacements, battery replacements, later plugs and progressive CAPEX are excluded from this comparison.
- CAPEX accuracy bands remain:
  - green: absolute delta up to €30k,
  - amber: above €30k and up to €50k,
  - red: above €50k.

## Rendering improvements
- Rebuilt the table for ten explicit columns.
- Removed the maturity column from the site-level 12-month comparison.
- Added a separate electricity column.
- Added a forecast-confidence column.
- Added explicit column widths for every column.
- Added sticky header/first-column behaviour and top/bottom horizontal scrolling.
- Reduced secondary text density and moved detailed methodology into an expandable panel.
- Updated PDF and Excel exports to match the new table.

## Validation
- AADT regression suite: passed.
- Monthly live-data parser tests: passed.
- Forward-12-month separation tests: passed.
- Long-term maturity transition tests: passed.
- CAPEX band boundary tests: passed.
- API and static-delivery smoke tests: passed.
