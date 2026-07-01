# QA v35.44 — Grant support render fix

## Fix

Fixed the setup dashboard render crash introduced in v35.43. The new ZEVI grant wrapper function accidentally called itself recursively instead of rendering the base Grant support input field.

## Validation

- `node --check js/app.js`
- `node --check js/data/zeviFundingLibrary.js`
- `python -m py_compile local_site_location_server.py`
- `npm test`
- all static `.mjs` regression tests
- new static guard preventing recursive `grantSupportField()` definitions
- ZIP integrity check
