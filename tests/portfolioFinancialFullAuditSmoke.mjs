import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from '../js/data/defaultAssumptions.js';
import { calculateDemand } from '../js/engines/demandEngine.js';
import { calculateYearByYear, summariseFinancials } from '../js/engines/financialEngine.js';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';
import { actualCapexForSite, capexNoteForSite } from '../js/data/capexCalibrationLibrary.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const PORTFOLIO_CATEGORY_FACTORS = {');
const end = app.indexOf('\nconst DEVELOPER_GROUPS = [', start);
assert.ok(start > 0 && end > start, 'Portfolio calculation block should be present');
const prelude = `
function portfolioCapexInfo(site, modelInitialCapex = 0) {
  const actual = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  const model = Number(modelInitialCapex || 0);
  const note = capexNoteForSite(site);
  return { actual, model, note, variance: actual > 0 && Number.isFinite(model) ? model - actual : null };
}
`;
const factory = new Function('DEFAULT_INPUTS','DEFAULT_SELECTED_CONFIG','calculateDemand','calculateYearByYear','summariseFinancials','PORTFOLIO_CALIBRATION_SITES','actualCapexForSite','capexNoteForSite','number','pct', `${prelude}${app.slice(start, end)}\nreturn { portfolioBenchmarksByCategory, portfolioFinancialRow, portfolioFinancialSummary, portfolioActualLandlordTerms };`);
const number = (v, d = 0) => Number(v).toLocaleString('en-IE', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v, d = 0) => `${(Number(v) * 100).toFixed(d)}%`;
const funcs = factory(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, calculateDemand, calculateYearByYear, summariseFinancials, PORTFOLIO_CALIBRATION_SITES, actualCapexForSite, capexNoteForSite, number, pct);

assert.equal(DEFAULT_INPUTS.landlordGpShare, 0, 'landlord GP share default should be 0');
assert.equal(DEFAULT_INPUTS.landlordGrossSalesShare, 0, 'landlord gross-sales share default should be 0');
let demand = calculateDemand(DEFAULT_INPUTS);
let yy = calculateYearByYear(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, demand);
assert.equal(yy.rows[0].landlordGpShare, 0, 'default engine row should not include GP share');
assert.equal(yy.rows[0].landlordGrossSalesShare, 0, 'default engine row should not include gross-sales share');

const bothInputs = { ...DEFAULT_INPUTS, landlordGpShare: 0.03, landlordGrossSalesShare: 0.10 };
demand = calculateDemand(bothInputs);
yy = calculateYearByYear(bothInputs, DEFAULT_SELECTED_CONFIG, demand);
assert.equal(yy.rows[0].landlordGpShare, 0, 'gross-sales should suppress GP when both are populated');
assert.ok(Math.abs(yy.rows[0].landlordGrossSalesShare - yy.rows[0].totalRevenue * 0.10) < 0.01, 'gross-sales share should be % of revenue');

const bothActualTerms = funcs.portfolioActualLandlordTerms({ actual: { landlordGpShare: 0.03, landlordGrossSalesShare: 0.10 } }, 100000, 50000, 0);
assert.equal(bothActualTerms.landlordGpShare, 0, 'portfolio actual terms should suppress GP when gross-sales exists');
assert.equal(bothActualTerms.landlordGrossSalesShare, 10000, 'portfolio actual gross-sales should be % of revenue');
assert.equal(bothActualTerms.gpSuppressed, true, 'portfolio actual terms should mark suppressed GP');

const activeSites = PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio && !s.excludeFromPortfolio && !s.excludeFromLiveUploads);
const benchmarks = funcs.portfolioBenchmarksByCategory(activeSites);
const rows = activeSites.map(site => funcs.portfolioFinancialRow(site, benchmarks));
const summary = funcs.portfolioFinancialSummary(rows);
const approx = (a,b,tol=0.05) => Math.abs(Number(a)-Number(b)) <= tol;
assert.equal(rows.length, 37, 'Portfolio Financials should have 37 active rows');
assert.equal(rows.filter(r => r.landlordApplied).length, 0, 'No portfolio row should assume landlord costs without actual terms');
assert.equal(rows.filter(r => r.status?.label === 'Not enough data').length, 0, 'Rows with parsed uploaded live days should not be wrongly marked Not enough data');
assert.deepEqual(rows.filter(r => r.status?.label === 'Low history').map(r => r.site.name).sort(), ['Aldi Donabate', 'SCG Cobh Golf Club', 'SCG Dundalk Golf Club'].sort(), 'Only the true <30-day sites should be low history');
assert.equal(rows.find(r => r.site.name === 'Banner Plaza Ennis Junction 12')?.operationalDays, 150, 'Banner live days should be parsed from annualisation method');
assert.equal(rows.find(r => r.site.name === 'Douglas Court')?.operationalDays, 59, 'Douglas live days should be parsed from annualisation method');
assert.equal(rows.find(r => r.site.name === 'Texaco Newcastle')?.operationalDays, 61, 'Texaco live days should be parsed from annualisation method');

for (const r of rows) {
  for (const key of ['modelCapex','annualKwh','annualRevenue','opexExElectricity','electricityCost','grossProfit','operatingCashflow']) {
    assert.ok(Number.isFinite(Number(r[key])), `${r.site.name}: ${key} should be finite`);
  }
  assert.ok(r.opexExElectricity >= 0, `${r.site.name}: OPEX should not be negative`);
  assert.ok(approx(r.grossProfit, r.annualRevenue - r.electricityCost), `${r.site.name}: gross profit identity failed`);
  assert.ok(approx(r.operatingCashflow, r.grossProfit - r.opexExElectricity), `${r.site.name}: EBITDA identity failed`);
  if (r.paybackYears !== null && r.paybackYears !== undefined) assert.ok(approx(r.paybackYears, r.actualCapex / r.operatingCashflow, 0.01), `${r.site.name}: payback identity failed`);
}
const sum = (arr, key) => arr.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
const actualRows = rows.filter(r => r.hasActualKwh && r.hasOperationalDays);
assert.ok(approx(summary.annualKwh, sum(actualRows, 'annualKwh'), 0.5), 'summary annual kWh should equal row sum');
assert.ok(approx(summary.annualRevenue, sum(actualRows, 'annualRevenue'), 0.5), 'summary annual revenue should equal row sum');
assert.ok(approx(summary.annualOpex, sum(actualRows, 'opexExElectricity'), 0.5), 'summary annual OPEX should equal row sum');
assert.ok(approx(summary.operatingCashflow, sum(actualRows, 'operatingCashflow'), 0.5), 'summary EBITDA should equal row sum');

console.log('Portfolio Financials full audit smoke passed.');
