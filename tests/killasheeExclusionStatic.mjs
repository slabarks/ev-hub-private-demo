import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';

const byId = Object.fromEntries(PORTFOLIO_CALIBRATION_SITES.map(s => [s.id, s]));
const killashee = byId.killashee_house_hotel;
assert.ok(killashee, 'Killashee reference record should remain available for audit');
assert.equal(killashee.displayInPortfolio, false, 'Killashee must be hidden from active portfolio');
assert.equal(killashee.includeWhenLiveUploaded, false, 'Killashee must not be promoted when live data is uploaded');
assert.equal(killashee.excludeFromLiveUploads, true, 'Killashee must be excluded from live upload matching');
assert.match(killashee.exclusionReason || '', /mixed AC\/DC/i, 'Killashee exclusion reason should explain mixed AC/DC treatment');
const app = fs.readFileSync('js/app.js', 'utf8');
assert.ok(app.includes('portfolioExcludedFromActivePortfolio'), 'App must have active portfolio exclusion helper');
assert.ok(app.includes('excludeFromLiveUploads'), 'Additional live-site path must skip excluded records');
console.log('Killashee exclusion static regression passed.');
