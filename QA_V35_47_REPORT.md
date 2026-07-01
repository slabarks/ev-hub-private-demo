# QA v35.47 — Low-data variance badge and Killashee exclusion

## Scope
- Changed portfolio variance display so sites with actual kWh below the confidence threshold show `Low data` instead of `No actual`.
- Excluded Killashee House Hotel from active DC-only portfolio calibration and live-data promotion because it is a mixed AC/DC site.
- Preserved Killashee only as an excluded reference hardware/CAPEX record.

## Regression tests completed
- ZIP source syntax checks: passed.
- `npm test`: passed.
- All static `.mjs` regression tests: passed.
- Comprehensive burn test: passed.
- Hardware mapping regression: passed.
- Kempower triple cabinet regression: passed.
- Live upload merge-safety regression: passed.
- Killashee exclusion regression: passed.
- Portfolio benchmark smoke test: passed.
- Responsive/layout static test: passed.
- ZEVI funding static regression: passed.
- Python server compile: passed.

## Portfolio smoke result
`{"normal":3,"outperforming":3,"capacity_pressure":3,"maturity_ramp":28}`

## Notes
- Killashee will not show in the active portfolio table even if uploaded live data includes the site name.
- Low-volume actual rows are intentionally not used for benchmark variance validation, but the table now correctly indicates that actual data exists.
