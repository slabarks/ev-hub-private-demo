# V17.27 — Coordinate-first AADT engine

## Summary

The Site Screening AADT engine has been rebuilt so AADT selection is driven by the exact screened map coordinate rather than the nearby-site radius or broad county text matching.

## Main changes

- The selected screening radius is now explicitly separated from AADT calculation. It continues to control nearby chargers/sites only.
- AADT now ranks TII counters from the map pin coordinate using distance, route evidence, road class and site-type motorway relevance.
- Broad county/place text such as Cork or Dublin no longer drives AADT selection by itself.
- Multiple nearby counters are blended only when they are on the same route/corridor and have plausible values.
- Same-corridor blends use distance weighting instead of a blind closest-3 average.
- Motorway counters are penalised for non-motorway retail/hotel/community contexts.
- Candidate cards now show coordinate-first basis, confidence, distance from map pin and scoring context.
- West Cork N71 counter coordinate proxies were added for the Bandon / Innishannon corridor where the offline TII AADT file had AADT values but missing WGS84 coordinates.

## Regression case

For `Cloghmacsimon, Bandon, Co. Cork, P72 XP22`, the previous engine could select the Ballincollig / Cork N22 corridor around 18.8 km away because of broad `Cork` text matching.

V17.27 now selects the nearer N71 corridor candidates around Bandon/Innishannon and labels the result as coordinate-first road-aware TII selection.

## Validation

- `npm test`
- all `.mjs` smoke/static tests
- `tests/aadt_regression_test.py`
- Python syntax check
- ZIP integrity checks
