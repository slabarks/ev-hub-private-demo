# V17.33 — AADT browser fallback + API no-cache guard

Fixes the persistent red AADT mismatch warning seen after deploying V17.32 on Render.

## Changes
- `/api/search`, `/api/version` and AADT API JSON responses now send explicit no-store headers.
- Browser-side coordinate-first AADT recalculation now falls back to bundled ranking coordinates when official TII counter locations cannot be loaded, so a stale/legacy server result is overwritten instead of blocking the user with an old-engine mismatch.
- Map plotting remains strict: only official TII counter coordinates are plotted as AADT markers. Bundled/approximate coordinates can support the AADT value fallback, but are not shown as official marker locations.
- Build marker updated to V17.33.
