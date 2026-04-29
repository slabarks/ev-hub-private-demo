# v35.8 Validation Report

## Fixes validated

- Investment Case section order now includes `leaseRisk`, so the lease-term warning card renders.
- Distributed dispenser/satellite input now receives a dynamic `max` based on selected cabinet.
- `enforceConfigCompatibility()` now clamps distributed dispenser counts to the selected cabinet maximum and clamps standalone charger count to at least 1.
- `render()` now enforces configuration compatibility before calculations render, preventing stale invalid product inputs from flowing into normal calculations.
- Investment Case now shows a warning banner when technical configuration is infeasible; outputs are modelling context only until Product Configuration passes.
- Hidden civils/electrical capex scaling remains active via `deriveCivilElectricalCost()`.

## Tests run

- JS syntax check: passed
- technicalEngine syntax check: passed
- civilElectricalCostLibrary syntax check: passed
- Python server syntax check: passed
- Existing engine tests: passed
- Manual validation matrix for over-limit Autel/Kempower distributed configurations: passed
- Hidden civils/electrical scaling smoke test across Kempower distributed, Autel distributed and Autel standalone: passed

## Key validation examples

- Autel Single Cabinet with 5 dispensers is invalid in the engine and will clamp to 4 in the UI state.
- Autel Double Cabinet with 7 dispensers is invalid in the engine and will clamp to 6 in the UI state.
- Kempower Single Cabinet with 3 dispensers is invalid in the engine and will clamp to 2 in the UI state.
- Kempower Triple Cabinet with 5 dispensers is invalid in the engine and will clamp to 4 in the UI state.

## Hidden civils/electrical scaling examples

- Kempower Single Cabinet, 2 dual dispensers, no battery: approx. €43,420 hidden installation/civils/electrical cost.
- Kempower Double Cabinet, 4 dual dispensers, no battery: approx. €66,565.
- Kempower Triple Cabinet, 4 dual dispensers, no battery: approx. €76,825.
- Autel Single Cabinet, 2 dual dispensers, no battery: approx. €40,815.
- Autel Standalone DH240, 2 chargers, no battery: approx. €31,425.
