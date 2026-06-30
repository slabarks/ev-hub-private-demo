# QA v35.43 — ZEVI grant auto-population

## Scope
- Added `js/data/zeviFundingLibrary.js` as the embedded ZEVI funding database.
- Imported the confirmed matched funding file and the wider ZEVI allocation reference file.
- Product Configuration → Grant support now auto-populates from confirmed/safe ZEVI matches.
- Generic, duplicate or fuzzy allocation matches are shown as review suggestions and are not auto-applied.
- Manual grant support entries are preserved and not overwritten by generic/fuzzy matches.

## Funding records embedded
- Confirmed matched portfolio records: 11
- ZEVI allocation reference records: 47

## Auto-apply rules tested
- Confirmed portfolio-site ID match → auto-apply.
- Confirmed alias/name match → auto-apply.
- Safe exact allocation-reference match → auto-apply.
- Duplicate allocation name, e.g. `EMO OIL SERVICE STATION` → no auto-apply.
- Generic allocation name, e.g. `TIPPERARY` → no auto-apply unless confirmed by portfolio mapping.
- Possible/fuzzy match → review suggestion only.

## Regression checks run
- `node --check js/app.js`
- `node --check js/data/zeviFundingLibrary.js`
- `python -m py_compile local_site_location_server.py`
- `npm test`
- all static `.mjs` regression tests, including `tests/zeviFundingStatic.mjs`

## Result
All checks passed.
