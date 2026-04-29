# QA Report — v35.15 Portfolio Benchmark Intelligence

## Scope implemented

Portfolio Calibration was repositioned from a variance-matching page into an operating-site benchmark and investment guidance layer.

Implemented changes:

- Replaced the main Portfolio Calibration story with **Actual performance vs peer benchmark**.
- Built category benchmark logic from the real operating portfolio, using mature + near-mature peers where available and clear fallback rules where a category has limited sample depth.
- Added benchmark factors by category:
  - sessions / 1,000 AADT
  - kWh / 1,000 AADT
  - sessions / plug / day
  - kWh / plug / day
  - kWh / kVA MIC / day
  - average kWh / session
  - net revenue / kWh
- Added site performance classification:
  - Capacity pressure
  - Under-capturing
  - Outperforming
  - In benchmark
  - Ramp-up
  - Review
- Added 20-year do-nothing path logic for each operating hub:
  - first plug utilisation trigger
  - first MIC/grid-power trigger
  - first charger-output trigger
  - first capacity trigger year
  - estimated 20-year lost kWh / lost revenue risk if current infrastructure is not expanded
  - Year 20 required MIC estimate
- Added recommended action language that separates:
  - demand-capture problems, where signage/app visibility/pricing/access should be improved before capex;
  - capacity problems, where plugs, MIC, charger output or battery should be tested in staged expansion.
- Kept uncalibrated/calibrated model variance only inside a collapsible **model QA diagnostics** section.
- Replaced the old variance-band filter with a performance-band filter.
- Updated the Portfolio matrix and priority view to focus on benchmark position, do-nothing risk, trigger year and recommended action.
- Added responsive CSS for the benchmark cards and diagnostic details.
- Added a portfolio benchmark smoke test script.

## Verification run

- `node --check js/app.js` passed.
- Core JS module syntax checks were run for the app, data, engine, provider, UI, state and utility files.
- `/usr/bin/python3 -m py_compile local_site_location_server.py` passed.
- `node tests/runTests.js` passed.
- `node tests/portfolioBenchmarkSmoke.mjs` passed across all 32 clean ROI operating sites.

Smoke-test classification output:

```json
{"under_capture":7,"capacity_pressure":11,"outperforming":3,"normal":2,"maturity_ramp":9}
```

## Notes and limitations

- The benchmark layer is intentionally not a forced fit to actual kWh.
- Rolling 30D actuals remain a current-performance signal; annual actual comparisons should be added when full 12-month site-level actuals are available.
- 20-year do-nothing path is a planning signal based on current actual run-rate, default BEV/traffic growth and the current model-equivalent configuration. It should be treated as an investment guide, not as a guarantee.
- Early/ramp-up sites are displayed, but they are not used as high-confidence mature accuracy proof.
