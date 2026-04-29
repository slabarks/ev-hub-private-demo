# v35.12 Portfolio Calibration QA Summary

Validated changes:
- Portfolio Calibration tab loads 32 clean Irish operating hubs.
- Excluded West Point, Ashbourne, Banner Plaza, Fota Island and Banbridge as agreed.
- Six mature 12+ month sites are flagged for the main back-test accuracy claim.
- Portfolio model-equivalent configurations calculate without runtime errors.
- Calibrated default demand/commercial inputs are applied.
- Investor PDF export includes Annual Technical Detail.
- Annual Excel export includes Annual Technical Detail section.
- Existing engine tests pass after recalibrated default references were updated.

Checks run:
- node --check js/app.js
- node --check js/engines/exportEngine.js
- python3 -m py_compile local_site_location_server.py
- npm test --silent
- 32 portfolio site model-calculation smoke test

Result: PASS.
