# V17.31 — Official TII AADT overlay + hover popups

- Added `/api/tii-counter-locations` so the browser can load official TII counter coordinates through the app server instead of relying only on direct browser/CORS access.
- AADT map markers are now drawn only when an official TII counter coordinate is available. Bundled approximate/offline coordinates are not used for map markers.
- Prevented counters from inheriting or being plotted at the screened site coordinate when the official counter location is unavailable.
- Improved the AADT popup behaviour: popups open on hover/focus/click and close automatically on mouse leave/blur, including diagnostic markers.
- Top 4 recommended AADT counters remain the default selectable UX; diagnostic nearby counters stay optional and off by default.
