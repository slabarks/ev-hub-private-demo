#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildMaturityModel, forecastSiteForward12M, forecastSiteMaturity, isotonicNonDecreasing } from "../js/engines/maturityEngine.js";

function syntheticHistory(siteScale = 1, months = 18, startMonth = 1) {
  const ramp = [0.34, 0.43, 0.51, 0.59, 0.66, 0.72, 0.78, 0.83, 0.88, 0.92, 0.95, 0.97, 0.985, 0.995, 1.0, 1.0, 1.01, 1.0];
  const season = [0.94, 0.95, 0.98, 1.00, 1.03, 1.06, 1.08, 1.07, 1.03, 1.00, 0.95, 0.91];
  return Array.from({ length: months }, (_, idx) => {
    const calendarMonth = ((startMonth - 1 + idx) % 12) + 1;
    const days = [31,28,31,30,31,30,31,31,30,31,30,31][calendarMonth - 1];
    const daily = 150 * siteScale * ramp[Math.min(idx, ramp.length - 1)] * season[calendarMonth - 1];
    return {
      monthIndex: idx + 1,
      month: `2025-${String(calendarMonth).padStart(2, "0")}`,
      calendarMonth,
      calendarDays: days,
      activeDays: days,
      isCompleteCalendarMonth: true,
      kwh: daily * days,
      sessions: daily * days / 30.4,
      netRevenue: daily * days * 0.66
    };
  });
}

function matureSite(name, scale, startMonth) {
  return {
    name,
    maturity: { dataDays: 540 },
    actual: { monthlyHistory: syntheticHistory(scale, 18, startMonth), dataDays: 540 }
  };
}

const sites = [
  matureSite("Mature A", 0.86, 1),
  matureSite("Mature B", 0.94, 3),
  matureSite("Mature C", 1.00, 5),
  matureSite("Mature D", 1.08, 7),
  matureSite("Mature E", 1.16, 9)
];

const model = buildMaturityModel(sites);
assert.equal(model.source, "empirical");
assert.ok(model.trainingSiteCount >= 3);
assert.ok(model.stableSiteCount >= 3);
assert.ok(model.empiricalMonths >= 6);
assert.equal(model.curve.length, 24);
for (let i = 0; i < model.curve.length; i += 1) {
  const point = model.curve[i];
  assert.ok(Number.isFinite(point.p25) && Number.isFinite(point.p50) && Number.isFinite(point.p75));
  assert.ok(point.p25 <= point.p50 + 1e-12);
  assert.ok(point.p50 <= point.p75 + 1e-12);
  if (i > 0) assert.ok(point.p50 + 1e-12 >= model.curve[i - 1].p50, "base curve must be monotonic");
}
assert.ok(model.curve[0].p50 < model.curve[11].p50);
assert.ok(model.curve[11].p50 <= 1.02);
assert.ok(model.backtest[6].sampleCount >= 3);
assert.ok(model.backtest[6].medianAbsoluteError < 0.25);

const earlyHistory = syntheticHistory(1.02, 6, 2);
const early = {
  name: "Early site",
  maturity: { dataDays: 180 },
  actual: { monthlyHistory: earlyHistory, dataDays: 180, asOfDate: "2025-07-31" }
};
const currentAnnualKwh = earlyHistory.slice(-3).reduce((sum, row) => sum + row.kwh / row.calendarDays, 0) / 3 * 365;
const forecast = forecastSiteMaturity({
  site: early,
  model,
  dataDays: 180,
  latestDate: "2025-07-31",
  currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64,
  currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365,
  recentDailySessions: currentAnnualKwh / 365 / 30.4,
  modelMatureAnnualKwh: 56000,
  trafficGrowth: 0.01,
  tariffGrowth: 0.02,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4,
  horizonMonths: 240
});
assert.equal(forecast.monthly.length, 240);
assert.ok(forecast.currentMaturityFactor > 0 && forecast.currentMaturityFactor <= 1.15);
assert.ok(forecast.matureAnnualKwh > 0);
assert.ok(forecast.next12mRevenue > 0);
assert.ok(forecast.next12mRevenueLow <= forecast.next12mRevenue);
assert.ok(forecast.next12mRevenue <= forecast.next12mRevenueHigh);
assert.ok(forecast.monthly.every(row => [row.kwh, row.sessions, row.revenue, row.lowerRevenue, row.upperRevenue].every(Number.isFinite)));
assert.ok(forecast.monthly.every(row => row.kwh >= 0 && row.revenue >= 0));

const forwardOnly = forecastSiteForward12M({
  site: early,
  model,
  dataDays: 180,
  latestDate: "2025-07-31",
  currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64,
  currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365,
  modelMatureAnnualKwh: 56000,
  trafficGrowth: 0.01,
  tariffGrowth: 0.02,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4
});
assert.equal(forwardOnly.monthly.length, 12);
assert.equal(forwardOnly.source, "actual-forward");
assert.ok(forwardOnly.monthly.every(row => row.forecastStage === "forward-actual-trajectory"));
assert.ok(Math.abs(forwardOnly.next12mRevenue - forecast.next12mRevenue) < 1e-6, "year 1 must equal the independent forward forecast");
assert.ok(forecast.monthly.slice(0, 12).every(row => row.forecastStage === "forward-actual-trajectory"));
assert.ok(forecast.monthly.slice(12).some(row => row.forecastStage === "long-term-maturity-transition"));


// Daily history must influence the recent run-rate while remaining blended with the annual basis.
const dailySignalSite = {
  name: "Daily signal site",
  maturity: { dataDays: 180 },
  actual: {
    monthlyHistory: syntheticHistory(0.8, 6, 1),
    dailyHistory: Array.from({ length: 180 }, (_, idx) => ({
      date: new Date(Date.UTC(2025, 0, 1 + idx)).toISOString().slice(0, 10),
      kwh: idx < 90 ? 100 : 200,
      sessions: idx < 90 ? 3 : 6,
      netRevenue: (idx < 90 ? 100 : 200) * 0.66,
      sourcePresent: true
    }))
  }
};
const dailySignalForecast = forecastSiteForward12M({
  site: dailySignalSite,
  model,
  dataDays: 180,
  latestDate: "2025-06-29",
  currentAnnualKwh: 100 * 365,
  currentAnnualRevenue: 100 * 365 * 0.66,
  currentAnnualSessions: 100 * 365 / 30.4,
  recentDailyKwh: 100,
  trafficGrowth: 0.01,
  tariffGrowth: 0,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4
});
assert.ok(dailySignalForecast.dailyHistoryAdjustedDailyKwh > dailySignalForecast.annualDailyKwh);
assert.ok(dailySignalForecast.baseAdjustedDailyKwh > dailySignalForecast.annualDailyKwh);
assert.ok(dailySignalForecast.baseAdjustedDailyKwh < dailySignalForecast.recentAdjustedDailyKwh);
assert.equal(dailySignalForecast.recentWeight, 0.5);

// Fewer than six complete months must never create an extrapolated site trend.
const fiveMonthSite = {
  name: "Five month site",
  maturity: { dataDays: 150 },
  actual: { monthlyHistory: syntheticHistory(1, 5, 1), dataDays: 150 }
};
const fiveMonthForecast = forecastSiteForward12M({
  site: fiveMonthSite,
  model,
  dataDays: 150,
  latestDate: "2025-05-31",
  currentAnnualKwh: 45000,
  currentAnnualRevenue: 45000 * 0.66,
  currentAnnualSessions: 45000 / 30.4,
  recentDailyKwh: 130,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4
});
assert.equal(fiveMonthForecast.trendPolicy.eligible, false);
assert.equal(fiveMonthForecast.trendPolicy.monthlyGrowth, 0);

// Six complete months may use a bounded trend, never above the policy cap.
assert.equal(forwardOnly.trendPolicy.eligible, true);
assert.ok(forwardOnly.trendPolicy.monthlyGrowth <= forwardOnly.trendPolicy.cap + 1e-12);
assert.ok(forwardOnly.trendPolicy.monthlyGrowth >= forwardOnly.trendPolicy.floor - 1e-12);

const lowPlateauForecast = forecastSiteMaturity({
  site: early,
  model,
  dataDays: 180,
  latestDate: "2025-07-31",
  currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64,
  currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365,
  modelMatureAnnualKwh: 25000,
  trafficGrowth: 0.01,
  tariffGrowth: 0.02,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4,
  horizonMonths: 240
});
const highPlateauForecast = forecastSiteMaturity({
  site: early,
  model,
  dataDays: 180,
  latestDate: "2025-07-31",
  currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64,
  currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365,
  modelMatureAnnualKwh: 120000,
  trafficGrowth: 0.01,
  tariffGrowth: 0.02,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4,
  horizonMonths: 240
});
assert.ok(Math.abs(lowPlateauForecast.next12mRevenue - highPlateauForecast.next12mRevenue) < 1e-6, "mature-state estimate must not change next-12-month revenue");
assert.notEqual(Math.round(lowPlateauForecast.monthly[23].revenue), Math.round(highPlateauForecast.monthly[23].revenue), "mature-state estimate should affect long-term projection after month 12");

const lateRampHistory = Array.from({ length: 14 }, (_, idx) => {
  const calendarMonth = (idx % 12) + 1;
  const days = [31,28,31,30,31,30,31,31,30,31,30,31][calendarMonth - 1];
  const daily = 45 + idx * 5.5;
  return { monthIndex: idx + 1, calendarMonth, calendarDays: days, activeDays: days, isCompleteCalendarMonth: true, kwh: daily * days, sessions: daily * days / 30.4, netRevenue: daily * days * 0.64 };
});
const lateRampForecast = forecastSiteMaturity({
  site: { name: "Late ramp site", maturity: { dataDays: 420 }, actual: { monthlyHistory: lateRampHistory, dataDays: 420, asOfDate: "2026-02-28" } },
  model,
  dataDays: 420,
  latestDate: "2026-02-28",
  currentAnnualKwh: 115 * 365,
  currentAnnualRevenue: 115 * 365 * 0.64,
  currentAnnualSessions: 115 * 365 / 30.4,
  recentDailyKwh: 115,
  modelMatureAnnualKwh: 155 * 365,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4,
  horizonMonths: 240
});
assert.equal(lateRampForecast.lateRamp, true);
assert.ok(lateRampForecast.forecastAgeMonths < lateRampForecast.ageMonths);
assert.ok(lateRampForecast.monthsToMaturity > 0);
assert.notEqual(lateRampForecast.longTermConfidence.key, "high");

const prior = buildMaturityModel([]);
assert.equal(prior.source, "prior");
assert.equal(prior.trainingSiteCount, 0);
assert.equal(prior.curve.length, 24);
assert.deepEqual(isotonicNonDecreasing([1, 3, 2, 4]), [1, 2.5, 2.5, 4]);

console.log("PASS — forward 12-month separation, maturity curve, confidence bands, back-test and 20-year forecast regression tests passed.");
