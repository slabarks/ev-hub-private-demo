#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import sys
import urllib.error
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402


def reset_caches() -> None:
    server.TII_LOCATION_CACHE.update({"loaded": False, "counters": [], "error": None, "source_mode": None, "source": None})
    server.TII_COUNTER_CACHE.update({"loaded": False, "counters": [], "error": None})
    server.TII_AADT_SUMMARY_CACHE.update({"loaded": False, "counters": [], "error": None})
    server.TII_LOCAL_AADT_CACHE.update({"loaded": False, "records": [], "error": None})
    server.TII_LOCATION_ENRICHMENT_CACHE.update({"attempted": False, "error": None, "matched": 0, "source": None})
    server.TII_DAILY_CSV_CACHE.clear()


class AadtProductionRegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.original_http_bytes = server.http_bytes

        def offline(*_args, **_kwargs):
            raise urllib.error.URLError("offline test fixture")

        cls.offline_http = offline
        server.http_bytes = offline
        reset_caches()
        cls.records = server.load_local_tii_aadt_records()

    @classmethod
    def tearDownClass(cls) -> None:
        server.http_bytes = cls.original_http_bytes
        reset_caches()

    def test_01_source_data_integrity(self):
        self.assertEqual(len(self.records), 417)
        ids = [str(r.get("site_id")) for r in self.records]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertTrue(all(isinstance(r.get("latest_aadt"), (int, float)) and r["latest_aadt"] > 0 for r in self.records))
        self.assertGreaterEqual(max(int(r.get("latest_year") or 0) for r in self.records), 2026)

    def test_02_bundled_coordinate_provenance_is_fail_safe(self):
        payload = json.loads((ROOT / "data" / "tii_counter_locations_bundled_vetted.json").read_text(encoding="utf-8"))
        rows = payload["locations"]
        self.assertEqual(len(rows), 306)
        coarse = [r for r in rows if r.get("map_coordinate_status") == "ranking-only-coarse-coordinate-not-for-map"]
        mappable = [r for r in rows if r.get("mappable_location")]
        self.assertEqual(len(coarse), 295)
        self.assertTrue(all(not r.get("mappable_location") and not r.get("official_location") for r in coarse))
        self.assertEqual(len(mappable), 11)
        self.assertEqual(payload.get("mappable_count"), 11)

    def test_03_official_loader_precedes_bundled_fallback(self):
        fixture = {
            "type": "FeatureCollection",
            "features": [{
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [-8.50, 51.90]},
                "properties": {"CoSit": "1234", "Description": "Fixture N22", "Route": "N22"},
            }],
        }

        def fixture_http(_url, timeout=0):
            self.assertGreater(timeout, 0)
            return json.dumps(fixture).encode("utf-8")

        try:
            server.http_bytes = fixture_http
            reset_caches()
            rows = server._load_tii_counter_locations_from_geojson(force_refresh=True)
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]["official_location"])
            self.assertTrue(rows[0]["mappable_location"])
            self.assertEqual(server.TII_LOCATION_CACHE["source_mode"], "live-official")
        finally:
            server.http_bytes = self.offline_http
            reset_caches()
            self.__class__.records = server.load_local_tii_aadt_records()

    def test_04_fallback_payload_discloses_source_and_counts(self):
        payload = server._public_tii_counter_locations_payload()
        self.assertEqual(payload["source_mode"], "bundled-fallback")
        self.assertEqual(payload["official_count"], 0)
        self.assertEqual(payload["mappable_count"], 11)
        self.assertEqual(payload["count"], 306)

    def test_05_manual_coordinate_validation(self):
        self.assertIsNone(server._manual_site_from_params("x", {"lat": ["nan"], "lon": ["-8"]}))
        self.assertIsNone(server._manual_site_from_params("x", {"lat": ["40"], "lon": ["-8"]}))
        valid = server._manual_site_from_params("x", {"lat": ["51.9"], "lon": ["-8.5"]})
        self.assertEqual(valid["lat"], 51.9)

    def test_06_ballincollig_selects_n22_and_exposes_diagnostics(self):
        result = server.resolve_auto_tii_aadt("Ballincollig", params={"lat": ["51.8879"], "lon": ["-8.5920"]})
        self.assertIn("N22", result["route"])
        self.assertGreater(result["aadt"], 10000)
        self.assertLessEqual(len(result["candidates"]), 4)
        self.assertGreater(len(result["nearby_counters"]), 4)
        self.assertLessEqual(len(result["nearby_counters"]), 40)
        self.assertNotIn("coarse ranking-only", result["confidence"].lower())

    def test_07_bandon_selects_n71_but_caps_proxy_confidence(self):
        result = server.resolve_auto_tii_aadt("Bandon N71", params={"lat": ["51.746"], "lon": ["-8.735"]})
        self.assertIn("N71", result["route"])
        self.assertEqual(result["coordinate_quality"], "route-segment-proxy")
        self.assertIn("Review required", result["confidence"])
        self.assertFalse(any(c.get("official_location") for c in result["candidates"]))

    def test_08_bare_bandon_uses_n71_priority_anchor(self):
        result = server.resolve_auto_tii_aadt("Bandon")
        self.assertEqual(result["route"], "N71")
        self.assertEqual(str(result["counter_id"]), "000000001711")
        self.assertEqual(result["aadt"], 21007)
        self.assertEqual(result["aadt_method_layer"], "priority-anchor")

    def test_09_bare_kinsale_uses_n71_priority_anchor(self):
        result = server.resolve_auto_tii_aadt("Kinsale")
        self.assertEqual(result["route"], "N71")
        self.assertEqual(str(result["counter_id"]), "000000001716")
        self.assertEqual(result["aadt"], 21451)
        self.assertEqual(result["aadt_method_layer"], "priority-anchor")

    def test_10_incidental_bandon_road_match_is_weak(self):
        rec = next(r for r in self.records if str(r.get("site_id")) == "000000001404")
        score, matched, has_strong = server._score_local_aadt_record(rec, "Bandon Cork")
        self.assertIn("bandon", matched)
        self.assertFalse(has_strong)
        self.assertLess(score, 3.0)

    def test_11_incidental_kinsale_road_match_is_weak(self):
        rec = next(r for r in self.records if str(r.get("site_id")) == "000000001253")
        score, matched, has_strong = server._score_local_aadt_record(rec, "Kinsale Cork")
        self.assertIn("kinsale", matched)
        self.assertFalse(has_strong)
        self.assertLess(score, 3.0)

    def test_12_explicit_m1_route_beats_unrelated_closer_routes(self):
        result = server.resolve_auto_tii_aadt("M1 motorway plaza junction", params={"lat": ["53.67"], "lon": ["-6.35"]})
        self.assertEqual(server._route_norm_for_group(result["route"].split(",")[0]), "M01")
        self.assertIn("Review required", result["confidence"])
        self.assertEqual(result["coordinate_quality"], "coarse-ranking-only")

    def test_13_coarse_exact_centroid_never_claims_high_confidence_or_mapping(self):
        result = server.resolve_auto_tii_aadt("Athlone", params={"lat": ["53.4239"], "lon": ["-7.9407"]})
        self.assertEqual(result["coordinate_quality"], "coarse-ranking-only")
        self.assertIn("Review required", result["confidence"])
        selected = [c for c in result["candidates"] if c.get("selected")]
        self.assertEqual(len(selected), 1)
        self.assertFalse(selected[0]["mappable_location"])
        self.assertIsNone(selected[0]["lat"])
        self.assertIsNone(selected[0]["lon"])
        self.assertNotEqual(result["aadt_selection_method"], "same_corridor_weighted")

    def test_14_curated_coonagh_mapping_is_consistent(self):
        result = server.resolve_auto_tii_aadt("Tesco Coonagh V94 TW71")
        self.assertEqual(result["aadt"], 33319)
        self.assertEqual(result["raw_tii_aadt"], 33319)
        self.assertFalse(result["curated_effective_override"])
        self.assertEqual(result["aadt_method_layer"], "curated-exact")

    def test_15_generic_place_does_not_trigger_curated_mapping(self):
        with self.assertRaises(RuntimeError):
            server.tii_aadt_from_curated_portfolio_mapping("Limerick city centre")

    def test_16_all_curated_counter_ids_exist(self):
        ids = {server.normalise_cosit(r.get("site_id")) for r in self.records}
        missing = []
        for rule in server.CURATED_PORTFOLIO_AADT_RULES:
            for sid in rule.get("ids") or []:
                if server.normalise_cosit(sid) not in ids:
                    missing.append(sid)
        self.assertEqual(missing, [])

    def test_17_route_normalization_prevents_m1_m01_split(self):
        self.assertEqual(server._route_norm_for_group("M1"), "M01")
        self.assertEqual(server._route_norm_for_group("M01"), "M01")
        self.assertEqual(server._route_norm_for_group("N6"), "N06")

    def test_18_random_grid_invariants(self):
        points = [
            (51.90, -8.47, "Cork retail"),
            (52.66, -8.63, "Limerick retail"),
            (53.35, -6.26, "Dublin retail"),
            (53.27, -9.05, "Galway retail"),
            (52.26, -7.11, "Waterford retail"),
            (54.00, -6.40, "Dundalk retail"),
            (52.84, -8.98, "Ennis retail"),
            (52.50, -6.57, "Wexford retail"),
        ]
        for lat, lon, label in points:
            result = server.resolve_auto_tii_aadt(label, params={"lat": [str(lat)], "lon": [str(lon)]})
            self.assertTrue(math.isfinite(float(result["aadt"])))
            self.assertGreater(result["aadt"], 0)
            self.assertLessEqual(len(result["candidates"]), 4)
            self.assertLessEqual(len(result["nearby_counters"]), 40)
            if result.get("coordinate_quality") == "coarse-ranking-only":
                self.assertIn("Review required", result["confidence"])
                self.assertTrue(all(not c.get("mappable_location") for c in result["candidates"] if c.get("selected")))


if __name__ == "__main__":
    unittest.main(verbosity=2)
