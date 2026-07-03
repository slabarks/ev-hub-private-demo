import assert from 'node:assert/strict';
import { DEFAULT_INPUTS, DEFAULT_SELECTED_CONFIG } from '../js/data/defaultAssumptions.js';
import { calculateDemand } from '../js/engines/demandEngine.js';
import { calculateYearByYear } from '../js/engines/financialEngine.js';

assert.equal(DEFAULT_INPUTS.landlordGpShare, 0, 'Default landlord GP share must be 0');
assert.equal(DEFAULT_INPUTS.landlordGrossSalesShare, 0, 'Default landlord gross-sales share must be 0');

const baseInputs = {
  ...DEFAULT_INPUTS,
  rawCorridorTrafficAadt: 30000,
  benchmarkProfile: 'auto',
  landlordGpShare: 0,
  landlordGrossSalesShare: 0
};
const baseDemand = calculateDemand(baseInputs);
const baseYy = calculateYearByYear(baseInputs, DEFAULT_SELECTED_CONFIG, baseDemand);
const baseRow = baseYy.rows.find(r => Number(r.totalRevenue) > 0);
assert.ok(baseRow, 'Base case should have revenue for landlord test');
assert.equal(baseRow.landlordGpShare, 0, 'Default GP share should not be applied');
assert.equal(baseRow.landlordGrossSalesShare, 0, 'Default gross-sales share should not be applied');

const gpInputs = { ...baseInputs, landlordGpShare: 0.03, landlordGrossSalesShare: 0 };
const gpRow = calculateYearByYear(gpInputs, DEFAULT_SELECTED_CONFIG, calculateDemand(gpInputs)).rows.find(r => Number(r.totalRevenue) > 0);
assert.ok(gpRow.landlordGpShare > 0, 'Manually populated GP share should be applied');
assert.equal(gpRow.landlordGrossSalesShare, 0, 'Gross-sales share should stay zero when not populated');

const bothInputs = { ...baseInputs, landlordGpShare: 0.03, landlordGrossSalesShare: 0.10 };
const bothRow = calculateYearByYear(bothInputs, DEFAULT_SELECTED_CONFIG, calculateDemand(bothInputs)).rows.find(r => Number(r.totalRevenue) > 0);
assert.equal(bothRow.landlordGpShare, 0, 'GP share must be suppressed when gross-sales share is populated');
assert.ok(bothRow.landlordGrossSalesShare > 0, 'Gross-sales share should be applied when populated');
assert.ok(Math.abs(bothRow.landlordGrossSalesShare - bothRow.totalRevenue * 0.10) < 1e-6, 'Gross-sales share should be calculated from revenue');

console.log('Landlord default-zero and precedence smoke passed.');
