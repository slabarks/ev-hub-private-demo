# V17.29 — AADT map overlay + browser fallback guard

- Adds AADT counter markers to the Site Screening map.
- Shows selected and recommended TII counters visually against the screened map point.
- Adds connecting lines from the site pin to candidate counters.
- Counter popups include route, distance, AADT, confidence and a Use this counter action.
- Adds browser-side coordinate-first AADT recalculation from the bundled TII counter database.
- Protects against mixed deployments where the browser is newer than the server and the server returns the old coordinate-enriched/county text method.
- Keeps nearby-site radius separate from AADT selection.
