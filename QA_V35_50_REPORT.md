# QA Report — v35.50 Portfolio Compact Rendering Fix

## Scope

This release keeps the v35.49 Portfolio Calibration logic intact and fixes the desktop rendering of the 10-column Portfolio Comparison table after splitting Variance, Model Accuracy and Status.

## Changes

- Portfolio table now uses compact display labels for long categories, model-accuracy badges and operational-status badges.
- Full labels remain available through tooltips, selected-site detail and popovers.
- Numeric columns, variance, model accuracy and status are protected against wrapping/overlap.
- Desktop table minimum width increased so horizontal scrolling is used instead of cramped/overlapping columns.
- Added `portfolioCompactRenderingStatic.mjs` regression test.

## Regression checks

Passed from the final working directory before packaging:

- `node --check js/app.js`
- `npm test`
- all individual `.mjs` regression tests
- comprehensive burn test: 417 scenario runs / 0 failures
- portfolio benchmark smoke test
- responsive/static layout tests
- compact portfolio rendering static regression

## Result

The model calculation logic is unchanged. This is a presentation/readability release for the Portfolio Comparison table.
