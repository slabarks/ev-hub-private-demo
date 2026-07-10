# V17.32 — AADT search API alignment + official overlay guard

Fixes the split where the browser loaded the newer AADT UI but `/api/search` could still return the older coordinate-enriched AADT response text.

Changes:
- `/api/search` now uses the same strict coordinate-first AADT resolver as `/api/auto-tii-aadt`.
- The server always attempts to enrich local AADT rows with the official TII Traffic Counter Locations resource, even when a bundled geocoded AADT JSON exists.
- AADT candidate objects now explicitly mark whether the map coordinate is official.
- Approximate/bundled coordinates remain valid for ranking fallback but are not presented as official map locations.
- Browser mismatch warning no longer falsely classifies a current server as old when the version is present; it separately warns when no official counter coordinates are available for the map overlay.
