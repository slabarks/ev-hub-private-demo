# QA Report — v35.52 Simple Portfolio Status

## Scope

Implemented the simplified Portfolio Comparison status column:

- Removed noisy directional table statuses such as `Ramp ↑`, `Ramp ↓`, `Ramp ⚠`, `Outperform`, and `Under`.
- Kept the visible Status column action-oriented with five simple labels: `Monitor`, `Ramp-up`, `Pressure`, `Review`, and `No actual`.
- Kept Variance as the model-fit signal. Variance remains clickable and retains the detailed accuracy explanation.
- Kept the Status badge clickable, with a concise operational/action explanation.
- Updated PDF/export operational status wording to the same simplified label set.

## Regression tests run

- ZIP/source syntax checks before packaging
- `node --check js/app.js`
- `node --check js/engines/exportEngine.js`
- `python -m py_compile server.py`
- `npm test`
- All individual `.mjs` static and smoke tests
- Comprehensive burn test: 417 scenarios / 0 failures
- Local server smoke test for `/` and `/js/app.js`
- Portfolio benchmark smoke test
- Portfolio compact rendering regression
- New simple-status static regression

## Portfolio smoke result

`portfolioBenchmarkSmoke.mjs` returned:

```json
{"normal":3,"review":3,"capacity_pressure":3,"maturity_ramp":28}
```

This is expected after simplifying Status:

- early sites remain `Ramp-up`,
- operational capacity candidates remain `Pressure`,
- mature/near-mature variance/setup concerns become `Review`,
- in-benchmark mature/near-mature sites remain `Monitor`.

## Package checks

- File count remains below the GitHub 100-file limit.
- Short-path ZIP packaging retained.
- Cache-busting version updated to `35.52-simple-status`.
