# QA Report — v35.57 AADT Waterfall Hardening

## Summary

AADT waterfall order, curated phrase matching, and offline coordinate loading were hardened.

## Key checks

- ZIP extraction: pass
- `server.py` compile: pass
- `npm test`: pass
- all individual `.mjs` tests: pass
- `python tests/aadt_regression_test.py`: pass, 24/24
- comprehensive burn test: pass, 417 scenario runs / 0 failures
- local server smoke test: pass

## AADT checks

- Booth Road, Clondalkin, D22 K3E5 → curated exact, 29,156 AADT
- South Lotts Road, D04 DH94 → curated exact, 18,000 AADT
- New site Fermoy → strict text fallback / Review required, not curated operating site
- generic Dublin retail site → strict text fallback / Review required

## Limitation

The local geocoded TII counter database is still not 100% coordinate-complete. The app now avoids online blocking when the local geocoded file is present, but completing the remaining counter coordinates remains the next data-quality task.
