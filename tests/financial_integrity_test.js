#!/usr/bin/env node
import assert from "node:assert/strict";
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, ASSUMPTION_METADATA, CONFIG_ASSUMPTION_METADATA } from "../js/data/defaultAssumptions.js";
import { calculateDemand } from "../js/engines/demandEngine.js";
import { calculateYearByYear, summariseFinancials } from "../js/engines/financialEngine.js";
import { batteryUsableEnergyKwh, deriveConfiguration, rechargeWindowDurationHours } from "../js/engines/technicalEngine.js";
import { irr, npv } from "../js/utils.js";
import { savePortfolioForecastSnapshots, listForecastSnapshots, clearForecastSnapshots } from "../js/engines/forecastSnapshotEngine.js";

function run(inputOverrides = {}, configOverrides = {}, horizon = 20) {
  const inputs = { ...DEFAULT_INPUTS, ...inputOverrides, investmentHorizon: horizon };
  const config = { ...DEFAULT_SELECTED_CONFIG, ...configOverrides };
  const demand = calculateDemand(inputs);
  const yearByYear = calculateYearByYear(inputs, config, demand);
  const summary = summariseFinancials(inputs, config, demand, yearByYear, horizon);
  return { inputs, config, demand, yearByYear, summary };
}

function close(actual, expected, tolerance = 1e-7, message = "values differ") {
  assert.ok(Number.isFinite(actual), `${message}: actual is not finite`);
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} != ${expected}`);
}


// Every visible/default input has structured audit provenance and calculation status.
for (const key of Object.keys(DEFAULT_INPUTS)) {
  assert.ok(ASSUMPTION_METADATA[key], `missing assumption metadata for ${key}`);
  assert.ok(ASSUMPTION_METADATA[key].basisType, `missing basis type for ${key}`);
  assert.ok(["active", "derived", "diagnostic", "reference"].includes(ASSUMPTION_METADATA[key].status), `invalid status for ${key}`);
}
for (const key of Object.keys(DEFAULT_SELECTED_CONFIG)) {
  assert.ok(CONFIG_ASSUMPTION_METADATA[key], `missing configuration metadata for ${key}`);
}
assert.equal(ASSUMPTION_METADATA.operatingHoursPerDay.status, "reference");
assert.equal(ASSUMPTION_METADATA.batteryAugmentationTriggerDeficitKw.status, "reference");

// Forecast snapshot storage is additive and retains the operating-site P25/P50/P75 evidence.
const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.has(key) ? memoryStorage.get(key) : null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: key => memoryStorage.delete(key)
};
clearForecastSnapshots();
const savedBatch = savePortfolioForecastSnapshots([{
  site: { id: "s1", name: "Snapshot Site", address: "Test", aadt: 10000, realMicKva: 200, actual: { asOfDate: "2026-07-13" } },
  next12mKwh: 100000, next12mKwhLow: 80000, next12mKwhHigh: 120000,
  next12mRevenue: 66000, next12mRevenueLow: 52800, next12mRevenueHigh: 79200,
  forecastOperatingCashflow: 20000, forecastOperatingCashflowLow: 12000, forecastOperatingCashflowHigh: 28000,
  operationalDays: 400, maturityForecast: { forward12m: { historyMonths: 13, confidence: { label: "Medium-high" } } }
}], { reason: "actual-data-upload", actualDataCutoff: "2026-07-13" });
assert.equal(savedBatch.saved, 1);
const snapshot = listForecastSnapshots()[0];
assert.equal(snapshot.predictedKwhP25, 80000);
assert.equal(snapshot.predictedKwh, 100000);
assert.equal(snapshot.predictedKwhP75, 120000);
assert.equal(snapshot.actualDataCutoff, "2026-07-13");
assert.equal(snapshot.forecastType, "operating-site-forward-12m");

// Snapshot persistence is optional and must never turn a valid upload into a model failure.
globalThis.localStorage = {
  getItem: () => null,
  setItem: () => { throw new Error("quota exceeded"); },
  removeItem: () => {}
};
const storageFailure = savePortfolioForecastSnapshots([{
  site: { id: "s2", name: "Storage Failure Site" },
  next12mKwh: 50000, next12mKwhLow: 40000, next12mKwhHigh: 60000
}], { reason: "actual-data-upload" });
assert.equal(storageFailure.persisted, false);
assert.equal(storageFailure.saved, 0);
assert.equal(storageFailure.attempted, 1);
assert.match(storageFailure.error, /quota exceeded/i);

globalThis.localStorage = {
  getItem: key => memoryStorage.has(key) ? memoryStorage.get(key) : null,
  setItem: (key, value) => memoryStorage.set(key, String(value)),
  removeItem: key => memoryStorage.delete(key)
};

// Financial utilities must reject meaningless IRRs and solve a conventional project correctly.
assert.equal(irr([1, 2, 3]), null, "all-positive cash flows do not have an investment IRR");
assert.equal(irr([-1, -2, -3]), null, "all-negative cash flows do not have an investment IRR");
assert.equal(irr([-100]), null, "single-period negative cash flow has no IRR");
close(irr([-100, 110]), 0.10, 1e-8, "simple IRR");
close(npv([-100, 110], 0.10), 0, 1e-8, "standard period-zero NPV timing");

const base = run({ discountRate: 0.08 });
assert.equal(base.summary.projectCashflows.length, 21, "20-year model must include period zero plus 20 year-end cash flows");
assert.equal(base.summary.projectCashflows[0], -base.summary.initialInvestment, "construction CAPEX must be period zero");
close(base.summary.projectCashflows[1], base.yearByYear.rows[0].operatingProfit, 1e-7, "Year 1 operating cash flow must occur at year end");
close(base.summary.npv, npv(base.summary.projectCashflows, 0.08), 1e-6, "summary NPV must use explicit project cash flows");
assert.ok(base.summary.paybackYears > 3 && base.summary.paybackYears < 4, "payback should be fractional rather than rounded to a whole year");
assert.equal(base.summary.cashflowTimingConvention, "Period 0 construction; operating cash flow at year end");

// Grants must be capped at gross eligible initial CAPEX and never create negative investment.
const grantStress = run({ grantSupport: 999999 });
assert.equal(grantStress.summary.initialInvestment, 0);
close(grantStress.summary.grantApplied, grantStress.summary.grossInitialInvestmentBeforeGrant, 1e-7, "grant cap");
assert.ok(grantStress.summary.grantUnapplied > 0);
assert.equal(grantStress.summary.grantCapped, true);
assert.ok(grantStress.yearByYear.rows.every(row => Number(row.initialInvestmentCapex || 0) >= 0));

// ESB application fee is an active CAPEX assumption for model-calculated projects.
const feeStress = run({ esbConnectionApplicationFee: 12345 });
close(feeStress.summary.grossInitialInvestmentBeforeGrant - run().summary.grossInitialInvestmentBeforeGrant, 12345, 1e-7, "ESB application fee propagation");

// Actual installed projects initialise the selected battery at COD and do not buy it again as a staged unit.
const actualInstalled = run({ discountRate: 0.08 }, { actualInitialCapexOverride: 865368 });
assert.equal(actualInstalled.yearByYear.batteryDeploymentMode, "installed-day-one");
assert.ok(actualInstalled.yearByYear.rows[0].installedBatteryUnits > 0);
assert.equal(actualInstalled.yearByYear.rows[0].newBatteryUnitsInstalled, 0);
assert.equal(actualInstalled.summary.initialInvestment, 865368);

// Reserve and dispatch fraction must reduce usable energy multiplicatively and consistently.
close(batteryUsableEnergyKwh(1000, 0.9, { batteryReserve: 0.10, batteryDispatchFractionUsable: 0.80 }), 648, 1e-9, "battery usable-energy formula");
const installedDefault = run({}, { batteryDeploymentMode: "Installed day one" });
const installedRestricted = run({ batteryReserve: 0.20, batteryDispatchFractionUsable: 0.80 }, { batteryDeploymentMode: "Installed day one" });
assert.ok(installedRestricted.yearByYear.rows[0].batteryUsableEnergyKwh < installedDefault.yearByYear.rows[0].batteryUsableEnergyKwh);
close(installedRestricted.yearByYear.rows[0].batteryUsableFraction, 0.64, 1e-9, "usable fraction");

// One battery-service cost source must be authoritative across technical and financial calculations.
const derivedInstalled = deriveConfiguration({ ...DEFAULT_SELECTED_CONFIG, batteryDeploymentMode: "Installed day one" }, DEFAULT_INPUTS);
close(installedDefault.yearByYear.rows[0].batteryAnnualService, derivedInstalled.batteryAnnualService, 1e-7, "battery annual service reconciliation");

// Reliability assumptions must propagate to served energy.
const noDowntime = run({ annualFailureRateStarting: 0, downtimeImpactFactor: 0 });
const downtime = run({ annualFailureRateStarting: 0.10, downtimeImpactFactor: 0.35 });
assert.ok(downtime.summary.year1DeliveredEnergy < noDowntime.summary.year1DeliveredEnergy);
close(downtime.summary.reliabilityAvailabilityFactor, 0.965, 1e-12, "availability factor");

// Overnight start/end are the source of truth; explicit duration is a fallback only.
assert.equal(rechargeWindowDurationHours({ overnightRechargeWindowStart: 22, overnightRechargeWindowEnd: 6, overnightRechargeWindowDuration: 2 }), 8);
assert.equal(rechargeWindowDurationHours({ overnightRechargeWindowStart: 6, overnightRechargeWindowEnd: 6, overnightRechargeWindowDuration: 7 }), 7);
const shortRecharge = run({ overnightRechargeWindowStart: 23, overnightRechargeWindowEnd: 2 });
assert.equal(shortRecharge.summary.rechargeWindowHours, 3);

// Lease duration must alter secured returns without changing the full-project NPV.
const lease5 = run({ discountRate: 0.08, leaseTerm: 5 });
const lease15 = run({ discountRate: 0.08, leaseTerm: 15 });
close(lease5.summary.npv, lease15.summary.npv, 1e-7, "whole-project NPV should not depend on display lease term");
assert.notEqual(lease5.summary.securedLeaseNpv, lease15.summary.securedLeaseNpv);
assert.equal(lease5.summary.securedLeaseHorizon, 5);
assert.equal(lease15.summary.securedLeaseHorizon, 15);
assert.ok(lease5.summary.postLeaseCashFlow > lease15.summary.postLeaseCashFlow);

// 0% discounting is allowed only with an explicit warning flag.
const undiscounted = run({ discountRate: 0 });
assert.equal(undiscounted.summary.npvIsUndiscounted, true);
close(undiscounted.summary.npv, undiscounted.summary.cumulativeCashFlow, 1e-6, "0% NPV equals undiscounted project cash flow");


// Deterministic randomized stress test across commercial, demand, grid and battery boundaries.
let seed = 2160719;
function random() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
}
function between(min, max) { return min + (max - min) * random(); }
const micValues = [50, 100, 200, 400, 800, 1000, 1500];
for (let i = 0; i < 400; i += 1) {
  const actualOverride = random() < 0.12 ? between(150000, 1000000) : 0;
  const inputOverrides = {
    rawCorridorTrafficAadt: between(1000, 100000),
    siteRelevanceFactor: between(0.05, 0.70),
    onRoadBevShareAtCod: between(0.01, 0.12),
    fastChargePropensity: between(0.08, 0.45),
    siteCaptureRate: between(0.03, 0.40),
    siteLimitationFactor: between(0.50, 1),
    averageSessionEnergy: between(15, 65),
    netSellingPriceExVat: between(0.35, 1.25),
    electricityCost: between(0.08, 0.65),
    discountRate: between(0, 0.18),
    grantSupport: between(0, 500000),
    leaseTerm: Math.floor(between(1, 21)),
    annualFailureRateStarting: between(0, 0.30),
    downtimeImpactFactor: between(0, 0.80),
    batteryReserve: between(0, 0.35),
    batteryDispatchFractionUsable: between(0.50, 1),
    overnightRechargeWindowStart: Math.floor(between(0, 24)),
    overnightRechargeWindowEnd: Math.floor(between(0, 24)),
    esbConnectionApplicationFee: between(0, 40000)
  };
  const configOverrides = {
    selectedMicKva: micValues[Math.floor(random() * micValues.length)],
    batteryDeploymentMode: random() < 0.35 ? "Installed day one" : "Staged as required",
    actualInitialCapexOverride: actualOverride
  };
  const x = run(inputOverrides, configOverrides);
  assert.ok(x.summary.initialInvestment >= 0, `random ${i}: negative initial investment`);
  assert.ok(x.summary.grantApplied <= x.summary.grossInitialInvestmentBeforeGrant + 1e-7, `random ${i}: grant over gross CAPEX`);
  assert.ok(x.summary.operatorFundedTotalCapex <= x.summary.grossTotalCapex + 1e-7, `random ${i}: operator CAPEX exceeds gross`);
  assert.equal(x.summary.projectCashflows.length, 21, `random ${i}: cash-flow length`);
  assert.ok(Number.isFinite(x.summary.npv), `random ${i}: non-finite NPV`);
  assert.ok(x.summary.irr === null || (Number.isFinite(x.summary.irr) && x.summary.irr > -1), `random ${i}: invalid IRR`);
  assert.ok(x.summary.lifetimeKwhDelivered <= x.demand.totalDemandedEnergyKwh + 1e-5, `random ${i}: served energy exceeds demand`);
  for (const row of x.yearByYear.rows) {
    for (const key of ["deliveredEnergyServedKwh", "totalRevenue", "electricityCost", "totalOperatingCosts", "grossTotalCapex", "totalCapex", "batteryUsableEnergyKwh"]) {
      assert.ok(Number.isFinite(Number(row[key])), `random ${i}: ${key} is non-finite`);
      assert.ok(Number(row[key]) >= -1e-7, `random ${i}: ${key} is negative`);
    }
    assert.ok(Number(row.batteryUsableEnergyKwh || 0) <= Number(row.batteryNominalEnergyKwh || 0) + 1e-7, `random ${i}: usable battery exceeds nominal`);
  }
}

console.log("PASS — financial timing, IRR validity, grant caps, battery usability, service reconciliation, reliability, recharge, lease-return and 400 randomized invariant tests passed.");
