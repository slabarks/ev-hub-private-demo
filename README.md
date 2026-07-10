# EV Charging Hub Investment Tool — V17.36 Lean Production Build

This is the production deployment package for **V17.36**.

V17.36 retains the fully audited AADT safeguards introduced after V17.34 and adds only the validated Bandon/Kinsale text-matching corrections reviewed from the V17.35 branch.

## AADT production behaviour

1. Curated known-site and Eircode matches are used where explicitly approved.
2. Manual or geocoded site coordinates are ranked against road-aware TII counter data.
3. Official TII counter locations are attempted first.
4. The audited bundled fallback is used only when the official source is unavailable.
5. Bandon and Kinsale use reviewed N71 priority anchors when no stronger site-specific evidence exists.
6. Incidental text such as “Bandon Road” or “Kinsale Road” is not treated as proof that a counter serves those towns.

## Coordinate safeguards

- Official TII points can receive normal coordinate confidence.
- Reviewed bundled points are mappable with capped confidence.
- Route-segment proxies require manual review.
- Coarse description-derived geometry is ranking-only: it is never plotted, never blended, and cannot receive automatic confidence.
- Explicit routes are normalised, including M1/M01 and N6/N06.
- Invalid, non-finite, or out-of-Ireland coordinates are rejected.
- The API returns proper 400/422 errors for invalid or unresolved requests.

## Run locally

```bash
python server.py
```

Open `http://localhost:10314/`.

## Mandatory production test

```bash
npm test
```

A successful run ends with:

```text
PASS — AADT unit, regression, provenance, API and static smoke tests completed successfully.
```

## Deployment gate

Before production use, confirm:

- `/api/version` reports **V17.36**.
- `/api/tii-counter-locations` reports whether the official source or bundled fallback is active.
- When fallback mode is active, only reviewed/proxy points are map-eligible and coarse results remain **Review required**.

See `RELEASE_NOTES_V17.36_AADT_AUDITED_PRODUCTION.md` for the release summary.
