# V17.36 — AADT Audited Production Release

## Base

V17.36 continues the established V17 release sequence and supersedes the V17.34/V17.35 AADT branches.

## Included improvements

- Official-TII-first counter-location loading.
- Safe audited fallback with coordinate-provenance controls.
- Coarse fallback geometry cannot be plotted, blended, or marked automatically confident.
- Explicit-route normalisation and decisive route matching.
- Correct Tesco Coonagh value of 33,319 AADT for counter `000000030189`.
- Proper API 400/422 responses for invalid and unresolved requests.
- Complete executable AADT regression and smoke-test suite.
- Bandon and Kinsale reviewed N71 priority anchors.
- Protection against misleading incidental names such as “Bandon Road” and “Kinsale Road”.

## Validation

- 18/18 AADT regression tests passed.
- Python and JavaScript syntax checks passed.
- Official-source and disconnected-fallback paths passed.
- Local API and static-file smoke tests passed.
- Geographic invariant sweep found no coarse-marker, coarse-blending, or false-confidence violations.

## Production requirement

Run `npm test` after extraction and confirm `/api/version` reports V17.36 before deployment.
