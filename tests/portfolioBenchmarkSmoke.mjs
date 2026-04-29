import fs from 'node:fs';
import assert from 'node:assert/strict';
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from '../js/data/defaultAssumptions.js';
import { calculateDemand } from '../js/engines/demandEngine.js';
import { calculateYearByYear, summariseFinancials } from '../js/engines/financialEngine.js';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const start = app.indexOf('const PORTFOLIO_CATEGORY_FACTORS = {');
const end = app.indexOf('\nconst DEVELOPER_GROUPS = [', start);
assert.ok(start > 0 && end > start, 'Portfolio block should be present');
const block = app.slice(start, end);
const factory = new Function('DEFAULT_INPUTS', 'DEFAULT_SELECTED_CONFIG', 'calculateDemand', 'calculateYearByYear', 'summariseFinancials', 'PORTFOLIO_CALIBRATION_SITES', `${block}\nreturn { portfolioBenchmarksByCategory, portfolioSiteResults };`);
const { portfolioBenchmarksByCategory, portfolioSiteResults } = factory(DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG, calculateDemand, calculateYearByYear, summariseFinancials, PORTFOLIO_CALIBRATION_SITES);
const benchmarks = portfolioBenchmarksByCategory(PORTFOLIO_CALIBRATION_SITES);
const rows = PORTFOLIO_CALIBRATION_SITES.map(site => portfolioSiteResults(site, benchmarks));
assert.equal(rows.length, 32, 'Portfolio smoke should cover 32 clean ROI sites');
for (const row of rows) {
  assert.ok(row.assessment?.band, `${row.site.name} should have a performance band`);
  assert.ok(row.assessment?.action, `${row.site.name} should have a recommended action`);
  assert.ok(Number.isFinite(row.metrics?.kwhPerPlugDay), `${row.site.name} should have kWh/plug/day`);
  assert.ok(Number.isFinite(row.benchmarkRange?.median), `${row.site.name} should have benchmark median`);
  assert.ok(row.doNothing?.rows?.length === 20, `${row.site.name} should have a 20-year do-nothing path`);
  assert.ok(!Object.values(row.doNothing.year20 || {}).some(v => typeof v === 'number' && !Number.isFinite(v)), `${row.site.name} year20 should not contain NaN/Infinity`);
}
const bandCounts = rows.reduce((acc, r) => { acc[r.assessment.band] = (acc[r.assessment.band] || 0) + 1; return acc; }, {});
assert.ok(Object.keys(bandCounts).length >= 2, 'Benchmark classifications should produce multiple performance bands');
console.log('Portfolio benchmark smoke passed:', JSON.stringify(bandCounts));
