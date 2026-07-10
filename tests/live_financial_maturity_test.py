#!/usr/bin/env python3
from __future__ import annotations

import csv
import datetime as dt
import io
import sys
from pathlib import Path
import unittest

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
        self.assertEqual(payload["schemaVersion"], "v17.41-live-history-v2")
        self.assertEqual(payload["buildId"], "EVHUB-V17.41-20260710-R1")
        self.assertEqual(payload["parserBuildId"], "EVHUB-LIVE-PARSER-17.41.1")
        self.assertTrue(payload["monthlyHistorySupported"])
        self.assertEqual(payload["siteCount"], 2)
        self.assertEqual(payload["monthlyHistorySiteCount"], 2)
        self.assertGreaterEqual(payload["monthlyObservationCount"], 17)
        self.assertGreater(payload["completeMonthObservationCount"], 0)
        by_name = {row["siteName"]: row for row in payload["siteActuals"]}

        mature = by_name["Synthetic Mature Site - Charger 1"]
        self.assertEqual(mature["maturity"]["tier"], "mature")
        self.assertEqual(mature["actual"]["annualisationMethod"], "trailing365")
        self.assertEqual(mature["actual"]["dataDays"] if "dataDays" in mature["actual"] else mature["maturity"]["dataDays"], 400)
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
