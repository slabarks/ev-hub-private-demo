#!/usr/bin/env python3
from __future__ import annotations

import csv
import datetime as dt
import io
import sys
from pathlib import Path
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import server  # noqa: E402


def daily_csv(sites: list[tuple[str, dt.date, int]]) -> bytes:
    stream = io.StringIO()
    writer = csv.writer(stream)
    writer.writerow(["Date of start_time", "charge_point_name", "Total charge_amount", "Total net", "transaction_id Count"])
    for name, start, days in sites:
        for idx in range(days):
            day = start + dt.timedelta(days=idx)
            daily_kwh = 55 + min(idx, 365) * 0.16
            writer.writerow([day.isoformat(), name, round(daily_kwh, 3), round(daily_kwh * 0.64, 2), max(1, round(daily_kwh / 30.4))])
    return stream.getvalue().encode("utf-8")


class LiveFinancialMaturityTests(unittest.TestCase):
    def test_monthly_history_is_retained_for_mature_and_early_sites(self):
        latest = dt.date(2026, 2, 4)
        mature_start = latest - dt.timedelta(days=399)
        early_start = latest - dt.timedelta(days=99)
        payload = server.parse_live_calibration_uploads([
            ("Daily_Charger_kWh.csv", daily_csv([
                ("Synthetic Mature Site - Charger 1", mature_start, 400),
                ("Synthetic Early Site - Charger 1", early_start, 100),
            ]))
        ])
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["schemaVersion"], "v21-live-history-v7")
        self.assertEqual(payload["buildId"], "EVHUB-V21.5-20260719-R1")
        self.assertEqual(payload["parserBuildId"], "EVHUB-LIVE-PARSER-21.5")
        self.assertTrue(payload["monthlyHistorySupported"])
        self.assertTrue(payload["dailyHistorySupported"])
        self.assertEqual(payload["siteCount"], 2)
        self.assertEqual(payload["monthlyHistorySiteCount"], 2)
        self.assertGreaterEqual(payload["monthlyObservationCount"], 17)
        self.assertGreater(payload["completeMonthObservationCount"], 0)
        self.assertEqual(payload["dailyHistorySiteCount"], 2)
        self.assertEqual(payload["dailyObservationCount"], 500)
        by_name = {row["siteName"]: row for row in payload["siteActuals"]}

        mature = by_name["Synthetic Mature Site - Charger 1"]
        self.assertEqual(mature["maturity"]["tier"], "mature")
        self.assertEqual(mature["actual"]["annualisationMethod"], "trailing365")
        self.assertEqual(mature["actual"]["dataDays"] if "dataDays" in mature["actual"] else mature["maturity"]["dataDays"], 400)
        daily_history = mature["actual"]["dailyHistory"]
        self.assertEqual(len(daily_history), 400)
        self.assertEqual(daily_history[-1]["date"], latest.isoformat())
        self.assertGreater(daily_history[-1]["rolling30Kwh"], 0)
        history = mature["actual"]["monthlyHistory"]
        self.assertGreaterEqual(len(history), 13)
        self.assertEqual([row["monthIndex"] for row in history], list(range(1, len(history) + 1)))
        self.assertGreaterEqual(sum(1 for row in history if row["isCompleteCalendarMonth"]), 12)
        self.assertTrue(all(row["calendarDays"] > 0 for row in history))
        self.assertAlmostEqual(sum(row["kwh"] for row in history), mature["diagnostics"]["cumulativeKwh"], places=2)

        early = by_name["Synthetic Early Site - Charger 1"]
        self.assertEqual(early["maturity"]["tier"], "early")
        self.assertEqual(early["actual"]["annualisationMethod"], "daily_cumulative")
        self.assertGreaterEqual(len(early["actual"]["monthlyHistory"]), 4)
        self.assertEqual(early["diagnostics"]["commercialDaysBasis"], "first_session")
        self.assertEqual(early["diagnostics"]["monthlyHistoryMonths"], len(early["actual"]["monthlyHistory"]))

    def test_complete_dashboard_zip_pack_is_supported(self):
        start = dt.date(2026, 1, 1)
        daily = daily_csv([("ZIP Pack Site - Charger 1", start, 70)])
        archive_stream = io.BytesIO()
        with zipfile.ZipFile(archive_stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Funded_Overview_Data/Overview/Daily_Charger_kWh.csv", daily)
            archive.writestr("Funded_Overview_Data/Ignore/Daily_Charger_kWh.csv", daily)
            archive.writestr("Funded_Overview_Data/Overview/readme.txt", b"supporting note")
        payload = server.parse_live_calibration_uploads([
            ("Funded_Overview_Data.zip", archive_stream.getvalue())
        ])
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["uploadedArchiveCount"], 1)
        self.assertEqual(payload["expandedSpreadsheetCount"], 1)
        self.assertEqual(payload["primarySourceSelection"], "canonical_filename")
        self.assertEqual(payload["primarySourceFiles"], ["Funded_Overview_Data/Overview/Daily_Charger_kWh.csv"])
        self.assertIn("parserTotal", payload["parserTimingsMs"])
        self.assertEqual(payload["siteCount"], 1)
        self.assertEqual(payload["monthlyHistorySiteCount"], 1)
        self.assertGreaterEqual(payload["monthlyObservationCount"], 3)
        self.assertEqual(payload["dailyHistorySiteCount"], 1)
        self.assertEqual(payload["dailyObservationCount"], 70)
        self.assertTrue(any("expanded 1 calibration spreadsheet" in warning for warning in payload["warnings"]))


    def test_full_pack_skips_supporting_workbooks_without_opening_them(self):
        start = dt.date(2026, 1, 1)
        daily = daily_csv([("Optimised Pack Site - Charger 1", start, 40)])
        archive_stream = io.BytesIO()
        with zipfile.ZipFile(archive_stream, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("Overview/Daily_Charger_kWh.csv", daily)
            archive.writestr("Overview/Unrelated_Broken.xlsx", b"not an excel workbook")
            archive.writestr("Overview/kWh_-_Running_Total.xlsx", b"not an excel workbook")
        payload = server.parse_live_calibration_uploads([("pack.zip", archive_stream.getvalue())])
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["primarySourceSelection"], "canonical_filename")
        self.assertEqual(payload["siteCount"], 1)
        self.assertIn("Overview/Unrelated_Broken.xlsx", payload["supportingFiles"])
        self.assertFalse(any("Unrelated_Broken" in err for err in payload["errors"]))

    def test_each_site_uses_its_own_latest_source_date(self):
        start = dt.date(2026, 1, 1)
        payload = server.parse_live_calibration_uploads([
            ("Daily_Charger_kWh.csv", daily_csv([
                ("Long Reporting Site - Charger 1", start, 60),
                ("Short Reporting Site - Charger 1", start, 30),
            ]))
        ])
        by_name = {row["siteName"]: row for row in payload["siteActuals"]}
        long_site = by_name["Long Reporting Site - Charger 1"]
        short_site = by_name["Short Reporting Site - Charger 1"]
        self.assertEqual(long_site["diagnostics"]["daysLive"], 60)
        self.assertEqual(short_site["diagnostics"]["daysLive"], 30)
        self.assertEqual(len(short_site["actual"]["dailyHistory"]), 30)
        self.assertEqual(short_site["actual"]["asOfDate"], (start + dt.timedelta(days=29)).isoformat())
        self.assertEqual(short_site["diagnostics"]["sourceCoveragePct"], 100.0)

    def test_daily_history_preserves_missing_source_dates_and_rolling_window(self):
        start = dt.date(2026, 1, 1)
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["Date of start_time", "charge_point_name", "Total charge_amount", "Total net", "transaction_id Count"])
        writer.writerow([start.isoformat(), "Daily Audit Site - Charger 1", 30, 19.2, 1])
        writer.writerow([(start + dt.timedelta(days=30)).isoformat(), "Daily Audit Site - Charger 1", 30, 19.2, 1])
        payload = server.parse_live_calibration_uploads([("Daily_Charger_kWh.csv", stream.getvalue().encode("utf-8"))])
        site = payload["siteActuals"][0]
        history = site["actual"]["dailyHistory"]
        self.assertEqual(len(history), 31)
        self.assertEqual(sum(1 for row in history if row["sourcePresent"]), 2)
        self.assertFalse(history[1]["sourcePresent"])
        self.assertEqual(history[1]["kwh"], 0)
        self.assertAlmostEqual(history[-1]["rolling30Kwh"], 30.0, places=3)
        self.assertAlmostEqual(site["diagnostics"]["sourceCoveragePct"], 2 / 31 * 100, places=2)

    def test_zero_demand_days_remain_inside_calendar_denominator(self):
        start = dt.date(2026, 1, 1)
        stream = io.StringIO()
        writer = csv.writer(stream)
        writer.writerow(["Date of start_time", "charge_point_name", "Total charge_amount", "Total net", "transaction_id Count"])
        writer.writerow([start.isoformat(), "Sparse Site - Charger 1", 30, 19.2, 1])
        writer.writerow([(start + dt.timedelta(days=30)).isoformat(), "Sparse Site - Charger 1", 30, 19.2, 1])
        payload = server.parse_live_calibration_uploads([("Daily_Charger_kWh.csv", stream.getvalue().encode("utf-8"))])
        history = payload["siteActuals"][0]["actual"]["monthlyHistory"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["calendarDays"], 31)
        self.assertEqual(history[0]["sourceDays"], 2)
        self.assertEqual(history[0]["activeDays"], 2)
        self.assertAlmostEqual(history[0]["kwhPerCalendarDay"], 60 / 31, places=4)


if __name__ == "__main__":
    unittest.main(verbosity=2)
