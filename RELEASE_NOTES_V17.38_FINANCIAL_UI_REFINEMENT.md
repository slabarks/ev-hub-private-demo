# V17.38 — Portfolio Financials UI Refinement

## Summary
V17.38 keeps the audited AADT resolver and maturity-adjusted financial engine from V17.37, and refines the **Portfolio Financials** experience to make the maturity logic easier to understand and cleaner to present.

## What changed
- Added a new **Maturity outlook** window to the Portfolio Financials dashboard.
- Added clear overview metrics for:
  - typical time to maturity,
  - average current maturity,
  - average months remaining,
  - number of already-mature sites,
  - forecast mode,
  - confidence mix.
- Reworked the maturity section so the detailed chart is now **optional** and hidden behind an expandable explanation.
- Improved maturity wording throughout the tab so users understand that:
  - **100%** means mature steady-state daily demand,
  - maturity is shown as a share of mature demand,
  - months remaining are shown to approximately **95% maturity**.
- Updated the table intro copy to explain the maturity column more clearly.
- Added light styling refinements for the maturity section and dashboard rendering.
- Version uplifted to **V17.38** across browser, server, package metadata and validation output.

## Validation
Full regression and smoke-test suite completed successfully:
- static syntax guards,
- AADT regression suite,
- live-data parser regression suite,
- maturity engine regression suite,
- local API and static delivery smoke test.
