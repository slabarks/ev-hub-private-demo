# QA Report — v35.18 Do-Nothing Plateau Fix

## Purpose
Fix a modelling issue where grid-only / do-nothing annual financials could collapse to zero delivered kWh once future peak-window demand exceeded the current MIC/charger capacity.

## Issue observed
For existing operating sites that need more plugs or power in the future, the annual table could show delivered kWh and revenue falling to zero from the first constrained year. This was not a realistic do-nothing case for an operating hub.

## Fix implemented
- Updated `js/engines/financialEngine.js` so capacity constraints separate:
  - demanded energy,
  - physically served energy,
  - unserved / lost energy.
- Grid-only sites now continue to serve the maximum deliverable throughput from the existing infrastructure.
- When future demand exceeds current plugs / MIC / charger power, delivered kWh plateaus instead of dropping to zero.
- Unserved demand continues to accumulate as lost kWh / lost revenue risk.
- Added explicit served-demand coverage ratio and plug coverage ratio to the year-by-year rows.

## Regression test added
Updated `tests/runTests.js` with a constrained grid-only case to verify:
- delivered kWh never collapses to zero while demand exists,
- constrained years record lost/unserved demand,
- delivered kWh plateaus after the first capacity-constrained year,
- served-demand coverage remains finite and bounded between 0 and 1.

## Verification performed
- `node --check js/app.js` — passed
- `node --check js/engines/financialEngine.js` — passed
- `node tests/runTests.js` — passed
- `node tests/portfolioBenchmarkSmoke.mjs` — passed across 32 clean ROI portfolio sites
- `python3 -m py_compile local_site_location_server.py` — passed

## Expected user impact
The annual financial table for do-nothing / constrained existing-site scenarios should now show stable plateau behaviour rather than an artificial crash to zero. The model will show that the site continues operating but leaves growing demand and revenue unserved until plugs, MIC, charger output or battery support are added.
