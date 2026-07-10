# V17.34 — AADT Production-Readiness Release Candidate

## Objective
Harden the AADT logic end-to-end before final investor use.

## Changes
- Promoted AADT engine build marker to `V17.34 AADT production-ready resolver + bundled vetted overlay`.
- Added bundled vetted TII counter-location overlay data so AADT markers remain visible when live TII/data.gov resources are unavailable.
- Preserved live official TII location source as preferred when reachable; bundled vetted overlay is used as a resilient fallback and clearly labelled as non-official where applicable.
- Removed dependency on the Site Screening radius for AADT. The AADT engine uses the exact screened map coordinate.
- Tightened Ballincollig/N22 aliasing: Ballincollig now favours the N22 corridor instead of accidentally boosting N40/Cork South Ring counters.
- Corrected the known Ballincollig/N22 proxy-coordinate issue so counters do not inherit the screened site coordinate and show `0.00 km` from site.
- Added server-side and browser-side mappable-location flags for AADT counter candidates.
- Kept only top 4 recommended counters visible/selectable by default.
- Kept diagnostic nearby counters optional and off by default.
- Hover/click map popup UX remains enabled; popup closes on mouse leave.

## Known limitation
The environment used to build this package could not directly download the full live TII GeoJSON file. Therefore V17.34 includes a bundled vetted counter-coordinate overlay for resilient map UX. Official TII live GeoJSON remains preferred where available. Coordinates labelled as bundled/vetted should still be reviewed on the TII map for final investment-critical decisions.

## Regression focus
- Bandon / Cloghmacsimon selects N71 corridor and no longer selects the distant Ballincollig N22 corridor.
- Ballincollig selects N22, not N40, and no selected counter is at 0.00 km from the screened site.
- API version marker is current.
- Top 4 recommendations remain enforced.
- Manual map selection and popup interaction remain present.
