#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  buildMaturityModel,
  classifySiteRepeatability,
  forecastSiteForward12M,
  forecastSiteMaturity,
  isotonicNonDecreasing
} from "../js/engines/maturityEngine.js";

function syntheticHistory(siteScale = 1, months = 18, startMonth = 1) {
  const ramp = [0.34, 0.43, 0.51, 0.59, 0.66, 0.72, 0.78, 0.83, 0.88, 0.92, 0.95, 0.97, 0.985, 0.995, 1.0, 1.0, 1.01, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0, 1.0];
  const season = [0.94, 0.95, 0.98, 1.00, 1.03, 1.06, 1.08, 1.07, 1.03, 1.00, 0.95, 0.91];
  return Array.from({ length: months }, (_, idx) => {
    const absoluteMonth = startMonth - 1 + idx;
    const calendarMonth = (absoluteMonth % 12) + 1;
    const calendarYear = 2025 + Math.floor(absoluteMonth / 12);
    const days = [31,28,31,30,31,30,31,31,30,31,30,31][calendarMonth - 1];
    const daily = 150 * siteScale * ramp[Math.min(idx, ramp.length - 1)] * season[calendarMonth - 1];
    return {
      monthIndex: idx + 1,
      month: `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`,
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

function dailyFromMonthly(monthly, startDate = "2025-01-01") {
  const rows = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  monthly.forEach(month => {
    const daily = month.kwh / month.calendarDays;
    for (let d = 0; d < month.calendarDays; d += 1) {
      rows.push({
        date: cursor.toISOString().slice(0, 10),
        kwh: daily,
        sessions: daily / 30.4,
        netRevenue: daily * 0.66,
        sourcePresent: true
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
  });
  return rows;
}

function matureSite(name, scale, startMonth) {
  const monthlyHistory = syntheticHistory(scale, 18, startMonth);
  return {
    name,
    categoryKey: "retail",
    maturity: { dataDays: 540 },
    actual: { monthlyHistory, dailyHistory: dailyFromMonthly(monthlyHistory), dataDays: 540 }
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
assert.equal(model.version, "prediction-engine-21.6");
assert.equal(model.source, "empirical");
assert.ok(model.trainingSiteCount >= 3);
assert.ok(model.stableSiteCount >= 3);
assert.ok(model.empiricalMonths >= 6);
assert.equal(model.curve.length, 24);
assert.ok(model.maturityThreshold >= 0.90 && model.maturityThreshold <= 0.95);
for (let i = 0; i < model.curve.length; i += 1) {
  const point = model.curve[i];
  assert.ok(Number.isFinite(point.p25) && Number.isFinite(point.p50) && Number.isFinite(point.p75));
  assert.ok(point.p25 <= point.p50 + 1e-12);
  assert.ok(point.p50 <= point.p75 + 1e-12);
  if (i > 0) assert.ok(point.p50 + 1e-12 >= model.curve[i - 1].p50, "base curve must be monotonic");
}
assert.ok(model.curve[0].p50 < model.curve[11].p50);
assert.ok(Math.abs(model.curve.at(-1).p50 - model.curve.at(-2).p50) < 0.05, "curve must converge smoothly without an artificial final jump");
assert.ok(model.backtest[6].sampleCount >= 3);
assert.ok(model.forecastValidation.generatedFromSiteCount >= 3);
assert.ok(model.forecastValidation.horizons[3].global.sampleCount > 0);
assert.ok(Number.isFinite(model.forecastValidation.horizons[3].global.ensemble.wape));

const earlyHistory = syntheticHistory(1.02, 6, 2);
const early = {
  name: "Early site",
  categoryKey: "retail",
  maturity: { dataDays: 180 },
  actual: { monthlyHistory: earlyHistory, dailyHistory: dailyFromMonthly(earlyHistory, "2025-02-01"), dataDays: 180, asOfDate: "2025-07-31" }
};
const currentAnnualKwh = earlyHistory.slice(-3).reduce((sum, row) => sum + row.kwh / row.calendarDays, 0) / 3 * 365;
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
assert.equal(forwardOnly.source, "actual-forward-ensemble");
assert.equal(forwardOnly.modelType, "explainable-ensemble");
assert.equal(forwardOnly.monthly.length, 12);
assert.ok(forwardOnly.monthly.every(row => row.forecastStage === "forward-explainable-ensemble"));
assert.ok(Math.abs(Object.values(forwardOnly.methodWeights).reduce((a, b) => a + b, 0) - 1) < 1e-9);
assert.ok(Object.keys(forwardOnly.candidateNext12mKwh).length >= 5);
assert.ok(forwardOnly.validationBiasCorrection >= 0.88 && forwardOnly.validationBiasCorrection <= 1.20);
assert.equal(forwardOnly.classification.key, "ramping");
assert.ok(forwardOnly.next12mKwh > 0);
assert.ok(forwardOnly.next12mRevenueLow <= forwardOnly.next12mRevenue);
assert.ok(forwardOnly.next12mRevenue <= forwardOnly.next12mRevenueHigh);

const forecast = forecastSiteMaturity({
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
  averageSessionKwh: 30.4,
  horizonMonths: 240,
  forward12m: forwardOnly
});
assert.equal(forecast.monthly.length, 240);
assert.ok(Math.abs(forwardOnly.next12mRevenue - forecast.next12mRevenue) < 1e-6, "year 1 must equal the independent forward forecast");
assert.ok(forecast.monthly.slice(0, 12).every(row => row.forecastStage === "forward-explainable-ensemble"));
assert.ok(forecast.monthly.slice(12).some(row => row.forecastStage === "long-term-maturity-transition"));
assert.ok(forecast.matureAnnualKwhP25 <= forecast.matureAnnualKwh);
assert.ok(forecast.matureAnnualKwh <= forecast.matureAnnualKwhP75);
assert.ok(forecast.commercialPotentialAnnualKwh > 0);
assert.ok(forecast.monthsTo90PctMaturity === null || forecast.monthsTo90PctMaturity >= 0);
assert.ok(forecast.monthsTo95PctMaturity === null || forecast.monthsTo95PctMaturity >= 0);

// Daily history must influence the recent run-rate while remaining blended with the annual basis.
const dailySignalSite = {
  name: "Daily signal site",
  categoryKey: "urban_service",
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
assert.ok(dailySignalForecast.recent90AdjustedDailyKwh > dailySignalForecast.annualDailyKwh);
assert.ok(dailySignalForecast.baseAdjustedDailyKwh > dailySignalForecast.annualDailyKwh);
assert.ok(dailySignalForecast.baseAdjustedDailyKwh < dailySignalForecast.recentAdjustedDailyKwh);
assert.equal(dailySignalForecast.recentWeight, 0.5);

// Fewer than six complete months must never create an extrapolated site trend.
const fiveMonthSite = {
  name: "Five month site",
  categoryKey: "hotel_destination",
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

// Mature plateau challenger can influence young-site Y1, but must not dominate the ensemble.
const lowPlateau = forecastSiteForward12M({ ...{
  site: early, model, dataDays: 180, latestDate: "2025-07-31", currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64, currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365, trafficGrowth: 0.01, tariffGrowth: 0.02,
  fallbackPrice: 0.66, averageSessionKwh: 30.4
}, modelMatureAnnualKwh: 25000 });
const highPlateau = forecastSiteForward12M({ ...{
  site: early, model, dataDays: 180, latestDate: "2025-07-31", currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64, currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365, trafficGrowth: 0.01, tariffGrowth: 0.02,
  fallbackPrice: 0.66, averageSessionKwh: 30.4
}, modelMatureAnnualKwh: 120000 });
assert.notEqual(Math.round(lowPlateau.next12mKwh), Math.round(highPlateau.next12mKwh));
assert.ok(highPlateau.next12mKwh / lowPlateau.next12mKwh < 1.35, "maturity challenger must remain bounded within the ensemble");

// Late-ramping and repeatable classifications.
const lateRampHistory = Array.from({ length: 14 }, (_, idx) => {
  const calendarMonth = (idx % 12) + 1;
  const days = [31,28,31,30,31,30,31,31,30,31,30,31][calendarMonth - 1];
  const daily = 45 + idx * 5.5;
  return { monthIndex: idx + 1, calendarMonth, calendarDays: days, activeDays: days, isCompleteCalendarMonth: true, kwh: daily * days, sessions: daily * days / 30.4, netRevenue: daily * days * 0.64 };
});
const lateRampSite = { name: "Late ramp site", categoryKey: "retail", maturity: { dataDays: 420 }, actual: { monthlyHistory: lateRampHistory, dailyHistory: dailyFromMonthly(lateRampHistory), dataDays: 420, asOfDate: "2026-02-28" } };
const lateClass = classifySiteRepeatability({ site: lateRampSite, model, dataDays: 420 });
assert.equal(lateClass.key, "late_ramping");
const stableClass = classifySiteRepeatability({ site: sites[2], model, dataDays: 540 });
assert.equal(stableClass.key, "repeatable");
assert.ok(stableClass.score >= 70);

// A real data gap / zero-output disruption must be identified and widen confidence.
const disruptedMonthly = syntheticHistory(1, 12, 1);
const disruptedDaily = dailyFromMonthly(disruptedMonthly);
for (let i = disruptedDaily.length - 12; i < disruptedDaily.length; i += 1) disruptedDaily[i].kwh = 0;
const disruptedSite = { name: "Disrupted", categoryKey: "retail", maturity: { dataDays: 365 }, actual: { monthlyHistory: disruptedMonthly, dailyHistory: disruptedDaily, dataDays: 365 } };
const disruptedClass = classifySiteRepeatability({ site: disruptedSite, model, dataDays: 365 });
assert.equal(disruptedClass.key, "declining_disrupted");
assert.equal(disruptedClass.disruptionSuspected, true);

// A persistent reduction in reporting chargers must be detected independently of kWh totals.
const chargerChangeDaily = dailyFromMonthly(syntheticHistory(1, 12, 1)).map((row, idx, arr) => ({
  ...row,
  reportingChargerCount: idx < arr.length - 20 ? 2 : 1,
  activeChargerCount: idx < arr.length - 20 ? 2 : 1
}));
const chargerChangeSite = { name: "Charger count change", categoryKey: "retail", maturity: { dataDays: 365 }, actual: { monthlyHistory: syntheticHistory(1, 12, 1), dailyHistory: chargerChangeDaily, dataDays: 365 } };
const chargerChangeClass = classifySiteRepeatability({ site: chargerChangeSite, model, dataDays: 365 });
assert.equal(chargerChangeClass.chargerDecreaseDetected, true);
assert.equal(chargerChangeClass.key, "declining_disrupted");

// Commercial potential and technical delivery capacity must remain separate.
const capacityForecast = forecastSiteMaturity({
  site: early,
  model,
  dataDays: 180,
  latestDate: "2025-07-31",
  currentAnnualKwh,
  currentAnnualRevenue: currentAnnualKwh * 0.64,
  currentAnnualSessions: currentAnnualKwh / 30.4,
  recentDailyKwh: currentAnnualKwh / 365,
  modelMatureAnnualKwh: 90000,
  technicalCapacityAnnualKwh: 42000,
  technicalCapacityRatio: 0.85,
  fallbackPrice: 0.66,
  averageSessionKwh: 30.4,
  horizonMonths: 60
});
assert.equal(capacityForecast.capacityConstrained, true);
assert.ok(capacityForecast.commercialPotentialAnnualKwh > capacityForecast.matureAnnualKwh);
assert.ok(capacityForecast.matureAnnualKwh <= 42000 + 1e-6);
assert.ok(capacityForecast.monthly.every(row => row.kwh >= 0 && Number.isFinite(row.kwh)));

const prior = buildMaturityModel([]);
assert.equal(prior.source, "prior");
assert.equal(prior.trainingSiteCount, 0);
assert.equal(prior.curve.length, 24);
assert.deepEqual(isotonicNonDecreasing([1, 3, 2, 4]), [1, 2.5, 2.5, 4]);

console.log("PASS — explainable ensemble forecasting, rolling validation, empirical confidence, repeatability classification, plateau ranges and technical-capacity separation passed.");
