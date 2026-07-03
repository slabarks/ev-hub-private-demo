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
assert.ok(start > 0 && end > start, 'Portfolio block should be present');
const block = app.slice(start, end);
const prelude = `
function portfolioCapexInfo(site, modelInitialCapex = 0) {
  const actual = Number(site?.actualCapexExVat || actualCapexForSite(site) || 0);
  const model = Number(modelInitialCapex || 0);
  const note = capexNoteForSite(site);
  return { actual, model, note, variance: actual > 0 && Number.isFinite(model) ? model - actual : null };
}
`;
const factory = new Function(
  'DEFAULT_INPUTS',
  'DEFAULT_SELECTED_CONFIG',
  'calculateDemand',
  'calculateYearByYear',
  'summariseFinancials',
  'PORTFOLIO_CALIBRATION_SITES',
  'actualCapexForSite',
  'capexNoteForSite',
  'number',
  'pct',
  `${prelude}${block}\nreturn { portfolioBenchmarksByCategory, portfolioFinancialRow, portfolioFinancialSummary };`
);
const number = (v, d = 0) => Number(v).toLocaleString('en-IE', { maximumFractionDigits: d, minimumFractionDigits: d });
const pct = (v, d = 0) => `${(Number(v) * 100).toFixed(d)}%`;
const { portfolioBenchmarksByCategory, portfolioFinancialRow, portfolioFinancialSummary } = factory(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, calculateDemand, calculateYearByYear, summariseFinancials, PORTFOLIO_CALIBRATION_SITES, actualCapexForSite, capexNoteForSite, number, pct);
const activeSites = PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio && !s.excludeFromPortfolio && !s.excludeFromLiveUploads);
const benchmarks = portfolioBenchmarksByCategory(activeSites);
const rows = activeSites.map(site => portfolioFinancialRow(site, benchmarks));
const summary = portfolioFinancialSummary(rows);

assert.equal(rows.length, 37, 'Portfolio Financials should cover the same 37 active calibration sites');
assert.ok(rows.every(r => Number.isFinite(r.modelCapex) && r.modelCapex >= 0), 'Every row should expose finite model CAPEX');
assert.ok(rows.some(r => !r.hasActualCapex), 'Rows with missing CAPEX should be retained for data-quality review');
assert.ok(rows.some(r => r.revenueEstimated), 'Rows with missing revenue should use estimated revenue where kWh exists');
assert.ok(rows.some(r => r.hasOperationalDays), 'Rows with confirmed operating days should remain usable');
assert.ok(rows.some(r => r.hasActualCapex && r.hasOperationalDays && r.hasActualKwh && r.operatingCashflow <= 0 && r.paybackState?.label === 'No payback'), 'Negative cashflow rows should show No payback instead of Not enough data');
assert.ok(rows.some(r => r.hasActualKwh && r.hasOperationalDays && !r.hasActualCapex ? r.status?.label !== 'Not enough data' : true), 'Missing CAPEX should not mask performance status where operating data exists');

const cope = rows.find(r => /The Cope/i.test(r.site?.name || ""));
assert.ok(cope, 'The Cope row should be present for OPEX regression');
assert.equal(cope.landlordApplied, false, 'Portfolio OPEX should not assume landlord costs where site-level landlord terms are absent');
assert.ok(String(cope.landlordNote || '').includes('Landlord costs excluded'), 'Portfolio OPEX should explain excluded landlord costs');
assert.ok(cope.modelGroundRentExcluded > 0, 'Model ground rent should be tracked as excluded, not silently applied');

assert.ok(summary.totalSites === 37, 'Portfolio financial summary site count should match active rows');
for (const key of ['actualCapex', 'modelCapexForCapexRows', 'annualKwh', 'annualRevenue', 'annualOpex', 'operatingCashflow']) {
  assert.ok(Number.isFinite(summary[key]), `Summary ${key} should be finite`);
}
console.log('Portfolio Financials calculation smoke passed.');
