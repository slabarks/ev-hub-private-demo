# QA Report — v35.49 portfolio accuracy/status separation

Implemented the Portfolio Comparison display change requested after v35.48.

## Changes

- Added separate **Model Accuracy** column between Variance and Status.
- Variance column now always displays the calculated percentage when actual annual/annualised kWh exists.
- Low-data handling remains available as tooltip/status metadata; it no longer replaces variance values.
- Status is retained as an operational signal rather than the model-fit label.
- Selected-site card, portfolio status popover, XLSX export and PDF table were updated to include the same separation.

## Regression

Passed locally from the packaged folder:

- `node --check js/app.js`
- `node --check js/engines/exportEngine.js`
- `npm test`
- all individual `.mjs` static tests
- comprehensive burn test: 417 scenario runs / 0 failures
- portfolio benchmark smoke test
- export static regression
- live upload merge-safety static regression

## Notes

This is a presentation/interpretation release. It does not change the core demand, CAPEX, AADT, ZEVI grant, hardware mapping, or financial calculation engines beyond exporting the new Model Accuracy label.
