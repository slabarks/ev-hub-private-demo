# QA V35.30 Report — Strict Scenario Battery Right-Sizing Fix

## Summary
v35.30 strengthens the Scenario Ranking battery optimisation logic after v35.29 still allowed oversized battery envelopes to rank ahead of the minimum technically feasible battery size for the same MIC and charger/plug layout.

## Fix implemented
- Scenario Ranking now applies a strict minimum technically feasible battery-envelope rule within identical hardware groups.
- The grouping key remains platform, battery strategy, MIC, charger/cabinet model, charger/dispenser count and service level.
- Within each group, if multiple feasible battery envelopes pass, the smallest battery unit count is retained before ROI sorting.
- Larger battery envelopes are discarded for that same hardware/MIC layout even if staged-envelope lifecycle economics make them appear attractive.

## Regression covered
- Autel Distributed, 100 kVA, 3 dual dispensers / 6 plugs now resolves to Autel 3x125kW/261kWh instead of Autel 7x125kW/261kWh.
- Autel Standalone, 100 kVA, 3 chargers / 6 plugs now resolves to Autel 3x125kW/261kWh instead of Autel 7x125kW/261kWh.

## Checks run
- JS syntax check: passed
- App JS syntax check: passed
- Core engine tests: passed
- New standalone battery right-sizing regression: passed
- Existing distributed battery right-sizing regression: passed
- Advanced settings visibility static regression: passed
- Demand benchmark profile static regression: passed
- Export static regression: passed
- Portfolio benchmark smoke test: passed
- Portfolio filter layout regression: passed
- Portfolio load-to-map regression: passed
- Portfolio status popover regression: passed
- Responsive static regression: passed
- Python server compile: passed

## Notes
The financial model still treats selected batteries as a staged envelope for lifecycle deployment. Scenario Ranking now prevents oversized equivalent envelopes from being selected ahead of the minimum feasible battery envelope for the same hardware/MIC layout.
