# QA V35.29 Report — Scenario Ranking Battery Right-Sizing Fix

## Issue fixed
Scenario Ranking could recommend an oversized selected battery envelope where a smaller battery envelope was already technically feasible for the same MIC and charger/plug layout.

Example behaviour corrected:
- 100 kVA MIC
- 3 dual dispensers / 6 plugs
- required peak around 314 kW
- 3 × 125 kW / 261 kWh battery passes the validator
- Scenario Ranking must not rank a 7-battery envelope above the 3-battery case for the same hardware layout.

## Root cause
The annual financial model treats the selected battery as a staged capacity envelope. In Scenario Ranking, larger envelopes could look artificially attractive because fixed deployment costs were spread across a larger selected battery envelope while only the required units were deployed year by year.

## Fix implemented
Added Scenario Ranking right-sizing logic inside `optimizerEngine.js`:
- feasible candidates are grouped by platform, MIC, charger/cabinet model, charger/dispenser count, battery strategy and service level;
- within each identical hardware/MIC group, the smallest technically feasible battery envelope is retained when served demand is materially the same;
- oversized battery envelopes are removed from ranking unless they provide a genuine served-demand improvement;
- ROI ranking is then applied only after the right-sizing filter.

## Validation
- JS syntax check passed.
- Core engine tests passed.
- Added regression test confirming that the Autel Distributed 100 kVA / 6-plug case chooses `Autel 3x125kW/261kWh`, not `Autel 7x125kW/261kWh`.
- Static UI/regression checks passed.
- Python server compile passed.
- ZIP integrity passed.
