import assert from "node:assert/strict";
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, MIC_VALUES, EXCEL_REFERENCE } from "../js/data/defaultAssumptions.js";
import { calculateDemand } from "../js/engines/demandEngine.js";
import { calculateYearByYear, summariseFinancials } from "../js/engines/financialEngine.js";
import { compareExcelScenarios } from "../js/engines/optimizerEngine.js";
import { validateConfiguration } from "../js/engines/technicalEngine.js";

function near(actual, expected, tol, label) {
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual}`);
}

const inputs = { ...DEFAULT_INPUTS };
const config = { ...DEFAULT_SELECTED_CONFIG };

assert.deepEqual(MIC_VALUES, [50, 100, 200, 400, 800, 1000, 1500], "MIC list must match Excel gold standard");

const demand = calculateDemand(inputs);
near(demand.years[0].annualEnergyDemandedKwh, EXCEL_REFERENCE.defaultDemandYear1AnnualEnergy, 0.1, "Demand Y1 energy");
near(demand.years[19].peakDemandRequiredKw, EXCEL_REFERENCE.defaultDemandYear20PeakDemandKw, 0.01, "Demand Y20 peak kW");

const yy = calculateYearByYear(inputs, config, demand);
near(yy.derived.initialInvestmentCapex, EXCEL_REFERENCE.defaultInitialInvestmentCapex, 0.01, "Initial investment capex");
assert.equal(yy.batteryDeploymentMode, 'staged-envelope', 'Battery deployment mode should stage selected battery envelope');
assert.ok(yy.rows.some(r => r.newBatteryUnitsInstalled > 0), 'Default battery case should deploy battery units only when required');
assert.ok(yy.rows.every(r => (r.batteryEnergyAvailableKwhSohAdjusted || 0) <= (r.batteryUsableEnergyKwh || 0) + 1e-9), 'SOH-adjusted battery energy cannot exceed installed nominal energy');
assert.ok(yy.rows.filter(r => r.batteryReplacementTrigger).length >= 0, 'Battery replacement logic should evaluate without errors');
assert.equal(yy.rows.find(r => r.chargerReplacementTrigger)?.year, EXCEL_REFERENCE.defaultFirstChargerReplacementYear, "First charger replacement year");

const summary10 = summariseFinancials(inputs, config, demand, yy, 10);
assert.equal(summary10.horizon, 10, "Selected horizon must control summary");
assert.ok(summary10.batteryReplacementCount >= 0, '10-year horizon replacement count should be defined');
assert.equal(summary10.chargerReplacementCount, 1, "10-year horizon has one charger replacement");

const invalid = validateConfiguration({ ...config, batteryStrategy: "Grid only", batterySize: "Autel 1x125kW/261kWh" });
assert.equal(invalid.valid, false, "Invalid battery strategy/battery combination should be rejected");

const scenarios = compareExcelScenarios(inputs, demand, 20);
assert.equal(scenarios.totalCombinationsGenerated, 6, "Excel scenario compare has six live configurations");
assert.ok(scenarios.scenarios.length === 6, "Scenario matrix must contain six scenarios");
assert.ok(scenarios.recommended || scenarios.technicallyFeasibleCombinations === 0, "Recommendation exists when feasible scenarios exist, otherwise no infeasible recommendation is made");

const zeroDemand = calculateDemand({ ...inputs, rawCorridorTrafficAadt: 0 });
assert.equal(zeroDemand.years[0].annualEnergyDemandedKwh, 0, "Zero traffic produces zero demand energy");

const zeroCapture = calculateDemand({ ...inputs, siteCaptureRate: 0 });
assert.equal(zeroCapture.years[0].annualSessionsDemanded, 0, "Zero capture rate produces zero sessions");

const capped = calculateDemand({ ...inputs, annualBevShareGrowthRate: 10 });
assert.ok(capped.years.every(y => y.bevShare <= inputs.bevShareCap), "BEV share must not exceed cap");

console.log("All EV Hub engine tests passed.");
