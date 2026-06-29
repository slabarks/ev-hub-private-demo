# QA v35.31 — Scenario Ranking Battery Right-Size Generation Fix

## Issue fixed
Scenario Ranking could still recommend an oversized battery envelope where the Product Configuration validator proved a smaller battery size was technically sufficient. The remaining cause was that the optimiser generated all battery envelopes and then relied on post-filtering, while the financial staged-envelope logic could still make larger envelopes appear attractive.

## Fix implemented
- Battery size is now right-sized during scenario generation, before financial ranking.
- For each MIC and charger/plug layout, the optimiser calculates the minimum battery envelope required for:
  - residual peak kW after MIC,
  - residual peak-window kWh after MIC,
  - overnight recharge feasibility.
- Only that minimum battery size is evaluated for the candidate layout.
- Larger battery envelopes no longer compete where they do not solve an additional technical constraint.

## Regression examples
- 100 kVA / 6-plug Autel Standalone and Autel Distributed cases select Autel 3x125kW/261kWh.
- 400 kVA / 14-plug Autel Distributed high-demand case selects Autel 5x125kW/261kWh, not Autel 7x125kW/261kWh.

## Checks run
- JS syntax check passed.
- Optimizer syntax check passed.
- Core engine tests passed.
- Existing battery right-sizing regressions passed.
- New high-demand 400 kVA / 14-plug battery right-sizing regression passed.
- Python server compile passed.
- ZIP integrity passed.
