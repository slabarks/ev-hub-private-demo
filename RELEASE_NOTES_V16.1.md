# Release Notes — v35.57 AADT Waterfall Hardening

This release fixes the remaining AADT methodology ordering issue identified in V16.

## Fixed

- `/api/auto-tii-aadt` no longer lets local text matching return before curated/Eircode matching.
- Curated phrase matching now requires the actual phrase/compact phrase, avoiding false positives from loose token matches such as `Dublin` + `Road`.
- Address-only AADT lookup now follows the investment-grade waterfall: curated → coordinate → geocode → TII coordinate/public → priority anchor → strict text fallback.
- Offline coordinate-enriched TII records are used directly without attempting slow/blocking online enrichment when the local geocoded file is present.

## Verified regressions

- Booth Road, Clondalkin, D22 K3E5 returns the curated AADT and not the M01 fallback.
- South Lotts Road, D04 DH94 returns the curated proxy and not the M01 fallback.
- Bare town searches such as `New site Fermoy` do not trigger curated operating-site mappings.
- Generic Dublin retail text falls to `Review required` text fallback rather than high-confidence motorway selection.
