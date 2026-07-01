"""
One-time geocoding utility for ePower portfolio site coordinates.

Uses Nominatim (OpenStreetMap) — completely free, no API key required.
Rate-limited to 1 request/second as per OSM usage policy.

Run from the project root:
    python tools/geocode_portfolio_sites.py

Output: updates js/data/operatingHubCalibrationLibrary.js in place,
replacing the approximate coordinates with Nominatim-verified positions.
Also writes tools/geocode_results.json for audit.

Requires: requests (pip install requests)
"""

import json, re, time, sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    import requests
except ImportError:
    print("Install requests first:  pip install requests")
    sys.exit(1)

LIBRARY_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "js", "data", "operatingHubCalibrationLibrary.js")
OUTPUT_JSON  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "geocode_results.json")

SITES = [
    ("Circle K Express Dungarvan",               "Youghal Road, Dungarvan, Co. Waterford, X35 XT71, Ireland"),
    ("Circle K - Junction 20",                   "Drumad, Ravensdale, Co. Louth, A91 AYW7, Ireland"),
    ("The Cope Shopping Centre",                  "35-57 Main Street, Dungloe, Co. Donegal, F94 N406, Ireland"),
    ("Walsh's Centra Service Station Roscommon",  "Castle Street, Roscommon, F42 CD63, Ireland"),
    ("Corrib Oil - Cork City",                    "Model Farm Road, Cork, T12 T326, Ireland"),
    ("Oran Point, Oranmore",                      "Oranpoint Shopping Centre, Oranmore, Co. Galway, H91 K6WF, Ireland"),
    ("Athlone - M6 Junction 13, Westpoint Business Centre", "Westpoint Business Centre, Monksland, Athlone, N37 W5K5, Ireland"),
    ("Corrib Oil - Tralee",                       "John Joe Sheehy Road, Tralee, Co. Kerry, V92 K7DH, Ireland"),
    ("The Brehon Hotel",                          "Muckross Road, Killarney, Co. Kerry, V93 RT22, Ireland"),
    ("Greenhills Hotel",                          "Ennis Road, Limerick, V94 X2RV, Ireland"),
    ("Southgate Shopping Centre",                 "Colp Cross, Drogheda, Co. Meath, A92 EF80, Ireland"),
    ("The Rhu Glenn Hotel",                       "Slieverue, Luffany, Co. Kilkenny, X91 E395, Ireland"),
    ("Ahern's Centra - Castlemartyr",             "Main Street, Castlemartyr, Co. Cork, P25 R762, Ireland"),
    ("Aherns Centra - Carrigtwohill",             "Main Street, Carrigtwohill, Co. Cork, T45 VK22, Ireland"),
    ("Charleville Park Hotel",                    "Limerick Road, Charleville, Co. Cork, P56 V268, Ireland"),
    ("Castletroy Park Hotel",                     "Dublin Road, Castletroy, Co. Limerick, V94 Y0AN, Ireland"),
    ("Mallow Plaza",                              "Limerick Road, Mallow, Co. Cork, P51 NX3F, Ireland"),
    ("Leopardstown Retail Park",                  "Arena Road, Sandyford, Dublin 18, D18 CC94, Ireland"),
    ("Finline Furniture - Dublin",                "Long Mile Retail Centre, Long Mile Road, Dublin 12, D12 DX0P, Ireland"),
    ("Axis Retail Park",                          "Battery Road, Longford, N39 X7W0, Ireland"),
    ("Tullamore Retail Park",                     "Tullamore Retail Park, Cloncollog, Tullamore, Co. Offaly, R35 VN23, Ireland"),
    ("Supervalu - Tipperary",                     "Kickham Place, Tipperary, E34 VP78, Ireland"),
    ("Newtown Park Hotel",                        "Ballindinas, Barntown, Co. Wexford, Y35 E8KT, Ireland"),
    ("Newbridge Retail Park",                     "Athgarvan Road, Moorfield, Newbridge, Co. Kildare, W12 N728, Ireland"),
    ("Circle K - Aherns Service Station",         "Abbey Road, Thurles, Co. Tipperary, E41 F9N1, Ireland"),
    ("Euro Business Park",                        "Euro Business Park, Little Island, Co. Cork, T45 Y261, Ireland"),
    ("Castleknock Hotel",                         "Porterstown Road, Castleknock, Dublin 15, D15 WNR7, Ireland"),
    ("Corrib Oil - Swinford",                     "Kilbride, Swinford, Co. Mayo, F12 C6E8, Ireland"),
    ("O'Brien's Larkin's Cross",                  "Larkin's Cross, Barntown, Co. Wexford, Y35 TR2A, Ireland"),
    ("Corrib Oil - Fermoy",                       "Cork Road, Fermoy, Co. Cork, P61 YD71, Ireland"),
    ("Malahide AFC",                              "Gannon Road, Malahide, Co. Dublin, K36 YA97, Ireland"),
    ("Aldi Donabate",                             "Turvey Avenue, Donabate, Co. Dublin, K36 D2T2, Ireland"),
    ("SCG Cobh Golf Club",                        "Cobh Golf Club, Marino Point, Cobh, Co. Cork, P24 Y226, Ireland"),
    ("SCG Dundalk Golf Club",                     "Dundalk Golf Club, Blackrock, Dundalk, Co. Louth, A91 Y7YD, Ireland"),
    ("Douglas Court",                             "Douglas Court Shopping Centre, Douglas, Cork, T12 V597, Ireland"),
    ("Banner Plaza Ennis Junction 12",            "Kilbreckan, Clarecastle, Ennis, Co. Clare, V95 TXA3, Ireland"),
    ("Texaco Newcastle",                          "Main Street, Ballynakelly, Newcastle, Co. Dublin, D22 E7N6, Ireland"),
]

HEADERS = {"User-Agent": "ePower-EV-Hub-Geocoder/1.0 (research@epower.ie)"}

def nominatim_geocode(address: str):
    url = "https://nominatim.openstreetmap.org/search"
    params = {"q": address, "format": "json", "limit": 1, "countrycodes": "ie"}
    try:
        resp = requests.get(url, params=params, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        results = resp.json()
        if results:
            return float(results[0]["lat"]), float(results[0]["lon"]), results[0].get("display_name", "")
    except Exception as e:
        print(f"  ERROR: {e}")
    return None, None, None

def update_library(lib_src: str, site_name: str, lat: float, lon: float) -> str:
    pos = lib_src.find(f'"name": "{site_name}"')
    if pos == -1:
        return lib_src
    aadt_pos = lib_src.find('"aadt":', pos)
    if aadt_pos == -1:
        return lib_src
    block = lib_src[pos:aadt_pos]
    block = re.sub(r'"lat":\s*[\d.\-]+', f'"lat": {round(lat, 6)}', block)
    block = re.sub(r'"lon":\s*[\d.\-]+', f'"lon": {round(lon, 6)}', block)
    return lib_src[:pos] + block + lib_src[aadt_pos:]

def main():
    print(f"Geocoding {len(SITES)} ePower portfolio sites via Nominatim (OpenStreetMap).")
    print("Rate limited to 1 request/second. Total time: ~40 seconds.\n")

    lib_src = open(LIBRARY_PATH, encoding="utf-8").read()
    results = []
    ok_count = 0

    for i, (name, address) in enumerate(SITES, 1):
        print(f"[{i:2d}/{len(SITES)}] {name}")
        print(f"       Query: {address}")
        lat, lon, display = nominatim_geocode(address)
        if lat and lon:
            print(f"       → {lat:.6f}, {lon:.6f}  ({display[:80]})")
            lib_src = update_library(lib_src, name, lat, lon)
            results.append({"name": name, "lat": lat, "lon": lon, "display": display, "status": "ok"})
            ok_count += 1
        else:
            print(f"       → NOT FOUND — keeping existing coordinates")
            results.append({"name": name, "status": "not_found", "address": address})
        if i < len(SITES):
            time.sleep(1.1)  # OSM usage policy: max 1 req/sec

    open(LIBRARY_PATH, "w", encoding="utf-8").write(lib_src)
    json.dump(results, open(OUTPUT_JSON, "w"), indent=2)

    print(f"\nDone. {ok_count}/{len(SITES)} sites geocoded.")
    print(f"Library updated: {LIBRARY_PATH}")
    print(f"Audit log: {OUTPUT_JSON}")
    print("\nRun the app regression tests to verify:")
    print("  node tests/runTests.js")

if __name__ == "__main__":
    main()
