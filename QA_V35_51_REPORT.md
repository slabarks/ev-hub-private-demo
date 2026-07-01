# QA Report — v35.51 Portfolio Variance/Status Simplification

## Scope

This release removes the visible Model Accuracy column from the Portfolio Comparison table. The variance column remains the hard model-vs-actual percentage and now acts as the entry point for accuracy detail.

## Changes

- Removed Model Accuracy from the main Portfolio Comparison table.
- Kept variance visible whenever actual kWh exists.
- Added clickable variance detail popover showing accuracy label, actual/model values, meaning and model basis.
- Kept Status focused on operational/commercial signal.
- Removed Model Accuracy from the investor PDF/XLSX portfolio table display.
- Kept the 9-column table compact and readable.

## Regression checks

- JS syntax checks
- Export/PDF static checks
- Portfolio popover static checks
- Responsive/static rendering checks
- Full npm regression suite
- ZIP integrity and extraction checks

