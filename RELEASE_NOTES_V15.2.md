# V15.2 — AADT Methodology Release

Release date: 2026-07-02
Scope: AADT selection engine (server.py), counter database, curated rules, tests.
All changes are backward-compatible with the V15 UI and engines.

---

## Phase 1 — Safety and correctness fixes

### 1.1 CRITICAL BUG FIX — priority place/city lookups restored
`_record_to_aadt_result()` referenced `selected_group` without it being a
parameter. Every priority anchor lookup (Dublin Airport, Cork Airport, Galway,
Little Island, Mahon, Ballincollig) raised `NameError`, was silently caught,
and fell through to weaker text matching. Fixed with an optional
`selected_group=None` parameter and a safe fallback to the record's own fields.

### 1.2 Road-class scoring penalty (coordinate lookup)
M-class motorway counters now receive a −8 selection-score penalty when the
searched address looks like retail/hotel/destination (not a fuel forecourt or
service station). Motorway counters that are genuinely correct (site accessed
from the motorway junction, e.g. Tallaght/M50) still win via route/text score.

### 1.3 Same-corridor averaging window tightened
10 km → 3 km. Prevents averaging counters from different road segments
(e.g. N7 inside vs outside the M50).

### 1.4 Text matching demoted
Text-only results are graded:
- route-code match (N7/M8/N25 in address) → "Direct counter / route-code text match"
- route or strong phrase evidence → "Corridor proxy"
- bare place tokens only → **"Review required / choose counter manually"** —
  never silently treated as reliable.

### 1.5 Standardised AADT confidence labels
Curated · Direct counter · Same-corridor average · Corridor proxy ·
Local proxy · Review required · Fallback.

### 1.6 Raw vs effective AADT separation
Every traffic result now carries `raw_aadt` (official TII counter value) and
`effective_aadt_note` explaining that the demand engine applies the site-type
cap. The raw counter value stays visible for audit in all outputs.

---

## Phase 2 — Data layer

### 2.1 Offline coordinate-enriched counter database
New file: `data/tii_aadt_counters_2019_2026_geocoded.json`
- all 417 TII counters with `route_class` (M/N/R), `location_source`,
  `location_confidence`
- 301/417 (72%) have offline lat/lon from a description-geometry match built
  from Irish junction coordinates — covering ALL Dublin motorway counters
  which caused the historical mismatches
- remaining 116 marked "not yet geocoded"; run
  `tools/enrich_counter_coords.py` once online to complete via the TII
  GeoJSON API
- server loads this file first, original file kept as fallback

### 2.2 Eircode-first geocoding
If the searched address contains an Eircode, the geocoder chain is run on the
Eircode alone first (routing-key precision ≈ 50 m at the premises entrance)
before falling back to full-address geocoding. Eliminates main-road coordinate
bias that previously caused motorway counters to win the distance ranking.

### 2.3 Regression test suite
New: `tests/aadt_regression_test.py` — 20 assertions covering:
- 8 Tesco Eircode curated matches return the exact expected AADT
- 6 bare town-name searches are correctly BLOCKED from curated rules
- priority lookups no longer NameError (bug 1.1 regression guard)
- place-token text matches demoted to Review
- geocoded DB coverage ≥ 70% and route_class ≥ 90%
Run: `python tests/aadt_regression_test.py` — all 20 pass.
The pre-existing JS engine test suite (`node tests/runTests.js`) also passes.

---

## Phase 3 — Investment-grade curated mappings

### 3.1 Strict curated matching
`_aadt_rule_matches_address()` rewritten. A curated rule can now only fire on:
1. exact Eircode match,
2. multi-word alias where ALL words appear, or
3. a single distinctive site alias ≥ 8 chars that is NOT a bare town name
   or multi-location retail/fuel brand.
Blocklist covers 50+ Irish towns and brands (supervalu, centra, applegreen,
aldi, tesco, …). A future search for "SuperValu Fermoy" can no longer inherit
the Circle K Fermoy portfolio AADT.

### 3.2 35 Tesco CPO sites curated, Eircode-keyed
All 35 Tesco Ireland CPO programme sites in `CURATED_PORTFOLIO_AADT_RULES`,
each keyed on its Eircode (compact + spaced form) plus address alias, with:
- selected TII counter ID(s)
- confidence tag: `[CONFIRMED]` (7 sites, TII-verified) or `[VERIFY]`
  (28 sites, best-available counter with a note stating what to check on
  trafficdata.tii.ie)
- `reviewed_by` and `reviewed_date` metadata for annual re-verification
Notable corrections vs the automatic lookup:
- South Lotts Road: 61,104 (M01 Airport fallback) → 18,000 (N31 proxy, VERIFY)
- Clondalkin: 61,104 → 29,156 (N7 Newlands approach, VERIFY)
- Cabra: 61,104 → 22,100 (N3 proxy, VERIFY)
- Ballyfermot: 61,104 → 19,800 (N7 Kingswood proxy, VERIFY)
- Rush: 61,104 → 15,200 (flagged for dedicated R127 counter, VERIFY)
- Coonagh: wrong-county N02 Meath counter → N18 Ennis Road Limerick

---

## Files changed
- `server.py`                                        (all engine fixes)
- `data/tii_aadt_counters_2019_2026_geocoded.json`   (new)
- `tests/aadt_regression_test.py`                    (new)
- `tools/enrich_counter_coords.py`                   (new)
- `tools/server_patches.py`                          (patch script, reference)

## Operational follow-ups
1. Run `tools/enrich_counter_coords.py` once with internet access to complete
   the remaining 116 counter coordinates from the official TII GeoJSON.
2. Verify the 28 `[VERIFY]` Tesco counters on trafficdata.tii.ie and flip
   them to `[CONFIRMED]`; re-run the regression tests after each change.
3. Re-run `tests/aadt_regression_test.py` after ANY future change to the
   matching logic — it is the guardrail against silent regressions.
4. Annual: TII republishes AADT each year; check `reviewed_date` fields and
   refresh curated values from the new summary report.
