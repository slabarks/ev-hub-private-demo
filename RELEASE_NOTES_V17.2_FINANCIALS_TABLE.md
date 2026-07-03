# V17.2 Financials Table Rendering Update

## Changes
- Simplified Portfolio Financials site table from 14 dense columns to 9 executive columns.
- Combined actual/model/delta CAPEX into one CAPEX column.
- Combined actual/model/variance kWh into one kWh/year column.
- Added clickable sorting to every Portfolio Financials table column.
- Improved rendering with fixed table layout, nowrap metric values, ellipsis for long configuration text, and muted insufficient-data rows.

## Validation
- npm test passed.
- All .mjs static/smoke tests passed.
- Comprehensive burn test passed with 417 scenario runs, 0 failures, 0 warnings.
- AADT regression passed with 24 passed, 0 failed.
