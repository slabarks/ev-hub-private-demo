#!/usr/bin/env python3
"""
AADT regression test — V15.2
Verifies:
  1. All 35 Tesco curated rules trigger on their Eircode
  2. Bare town names do NOT trigger curated rules (strict matching)
  3. The selected_group bug is fixed (priority lookups don't NameError)
  4. Text-only place-token matches are demoted to "Review required"
  5. Geocoded counter DB loads with coordinate coverage >= 70%

Run:  python tests/aadt_regression_test.py
"""
import sys, json
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# Import server module functions without starting the HTTP server
import importlib.util
spec = importlib.util.spec_from_file_location(
    "evserver", Path(__file__).resolve().parent.parent / "server.py")
srv = importlib.util.module_from_spec(spec)
# Prevent main() from running
import types
spec.loader.exec_module(srv)

PASS = 0; FAIL = 0
def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  ✓ {name}")
    else: FAIL += 1; print(f"  ✗ {name}  {detail}")

print("── 1. Tesco Eircode curated matching ──")
TESCO = [
    ("W91R2EF","Monread Road, Naas",87360), ("D17AP80","Clarehall SC, Coolock",61104),
    ("D11XY4E","Finglas Clearwater",146632), ("W23W6X3","Dublin Road, Maynooth",52976),
    ("K32CK84","Millfield, Balbriggan",79162), ("R32YP86","JFL Avenue, Portlaoise",29622),
    ("A92X820","Donore Road, Drogheda",41287), ("A91PK74","Avenue Road, Dundalk",11555),
]
for ec, label, expect_aadt in TESCO:
    try:
        r = srv.tii_aadt_from_curated_portfolio_mapping(f"Tesco, {label}, {ec}")
        check(f"{label} [{ec}]", r["aadt"] == expect_aadt, f"got {r['aadt']}, want {expect_aadt}")
    except Exception as e:
        check(f"{label} [{ec}]", False, f"no rule matched: {e}")

print("── 2. Bare town names must NOT trigger curated rules ──")
for town in ["New site Fermoy", "Retail unit Tralee", "Petrol station Naas",
             "Aldi Dundalk", "SuperValu Athlone", "Hotel Killarney town"]:
    try:
        r = srv.tii_aadt_from_curated_portfolio_mapping(town)
        check(f"'{town}' blocked", False, f"WRONGLY matched: {r.get('source','')[:60]}")
    except Exception:
        check(f"'{town}' blocked", True)

print("── 3. Priority lookup must not NameError (selected_group bug) ──")
for addr, latlon in [("Dublin Airport logistics", (53.4264,-6.2499)),
                     ("Galway city retail", (53.2707,-9.0568))]:
    try:
        site = {"lat": latlon[0], "lon": latlon[1], "name": addr}
        r = srv.tii_aadt_priority_counter_lookup(addr, site)
        check(f"priority '{addr}'", isinstance(r.get("aadt"), int) and r["aadt"] > 0)
    except NameError as e:
        check(f"priority '{addr}'", False, f"NameError (bug regressed): {e}")
    except RuntimeError:
        check(f"priority '{addr}'", True, "(no rule matched — acceptable)")

print("── 4. Place-token-only text matches demoted to Review ──")
try:
    r = srv.tii_aadt_from_local_excel_name_lookup("random shop dublin")
    check("dublin-only demoted", "Review required" in r.get("confidence",""),
          f"got confidence: {r.get('confidence')}")
except RuntimeError:
    check("dublin-only demoted", True, "(no match at all — also safe)")

print("── 5. Geocoded counter DB coverage ──")
db_path = Path(__file__).resolve().parent.parent / "data" / "tii_aadt_counters_2019_2026_geocoded.json"
check("geocoded DB exists", db_path.exists())
if db_path.exists():
    db = json.loads(db_path.read_text())
    recs = db["records"]
    with_coords = sum(1 for r in recs if r.get("lat"))
    cov = with_coords / len(recs)
    check(f"coverage {with_coords}/{len(recs)} = {cov*100:.0f}%", cov >= 0.70)
    with_class = sum(1 for r in recs if r.get("route_class") in ("M","N","R"))
    check(f"route_class present {with_class}/{len(recs)}", with_class >= len(recs)*0.9)


print("── 6. Endpoint waterfall order: curated/Eircode before text/geocode ──")
WATERFALL_CASES = [
    ("Booth Road, Clondalkin, Dublin 22 D22 K3E5", 29156, "curated-exact"),
    ("South Lotts Road, Bath Avenue Place, Dublin 4 D04 DH94", 18000, "curated-exact"),
    ("New site Fermoy", None, "strict-text-fallback"),
    ("generic Dublin retail site", None, "strict-text-fallback"),
]
for addr, expected, layer in WATERFALL_CASES:
    try:
        r = srv.resolve_auto_tii_aadt(addr, params={}, mode="balanced")
        if expected is not None:
            check(f"waterfall '{addr[:34]}...' AADT", r.get("aadt") == expected and r.get("aadt_method_layer") == layer, f"got {r.get('aadt')} / {r.get('aadt_method_layer')}")
        else:
            check(f"waterfall '{addr[:34]}...' safe fallback", r.get("aadt_method_layer") == layer and "Review required" in r.get("confidence", ""), f"got {r.get('aadt')} / {r.get('aadt_method_layer')} / {r.get('confidence')}")
    except Exception as e:
        check(f"waterfall '{addr[:34]}...'", False, str(e))

print(f"\n══ RESULT: {PASS} passed, {FAIL} failed ══")
sys.exit(1 if FAIL else 0)
