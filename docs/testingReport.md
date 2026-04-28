# v35 Production Final Testing Report

Date: 2026-04-28

## Summary
The v35 production build includes the optimiser no-candidate fix, Scenario Ranking card layout, clearer Annual Financials event badges, and exact Demand Forecast quick-look icon assets.

## Checks run
- JavaScript syntax check: passed
- Optimiser engine syntax check: passed
- Python local server syntax check: passed
- Existing JS engine tests: passed
- Scenario optimiser edge cases: passed
  - base case
  - very high traffic case
  - extreme no-candidate case
  - low-demand case
- Equipment matrix smoke test: passed
  - 3,696 configurations tested
  - 1,419 feasible
  - 2,277 infeasible
  - 0 failures
- Performance smoke test: passed
  - 20 recalculation + optimiser runs
  - average local execution time: ~420 ms per run

## Critical fix verified
The optimiser no longer crashes when an extreme demand case exceeds the equipment library. It now returns structured infeasible scenario rows with failure reasons and suggested fixes.
