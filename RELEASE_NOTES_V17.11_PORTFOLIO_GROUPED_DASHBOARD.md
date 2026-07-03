# V17.11 — Portfolio Financials grouped dashboard

## Summary
Restructures the Portfolio Financial Performance dashboard so the same metrics are retained but grouped into clear investor-facing windows:

1. Investment position
2. Current operating performance
3. Projection & profitability
4. Compact performance-position strip

## Changes
- Restored CAPEX Δ and added CAPEX Δ % prominently in Investment position.
- Moved all current run-rate metrics into Current operating performance.
- Moved 5/10/15/20-year projection metrics into Projection & profitability.
- Made the projection horizon selector compact inside the projection window.
- Made the filter panel collapsible and less visually dominant.
- Reset Portfolio Financial filters to a new V17.11 storage namespace so the default view starts from All sites.
- Kept all existing sortable table columns and calculation logic.

## Validation
- npm test passed.
- All .mjs static/smoke tests passed.
- AADT regression passed: 24 passed, 0 failed.
- Burn test passed: 417 scenario runs, 0 failures, 0 warnings.
