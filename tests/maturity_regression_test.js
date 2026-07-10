#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildMaturityModel, forecastSiteMaturity, isotonicNonDecreasing } from "../js/engines/maturityEngine.js";

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
assert.notEqual(lateRampForecast.confidence.key, "high");

const prior = buildMaturityModel([]);
assert.equal(prior.source, "prior");
assert.equal(prior.trainingSiteCount, 0);
assert.equal(prior.curve.length, 24);
assert.deepEqual(isotonicNonDecreasing([1, 3, 2, 4]), [1, 2.5, 2.5, 4]);

console.log("PASS — maturity curve, confidence bands, back-test and 20-year site forecast regression tests passed.");
