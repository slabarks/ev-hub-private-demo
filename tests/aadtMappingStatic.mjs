import assert from 'node:assert/strict';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';

const byId = Object.fromEntries(PORTFOLIO_CALIBRATION_SITES.map(s => [s.id, s]));
const expected = {
  supervalu_tipperary: 7093,
  the_brehon_hotel: 14326,
  the_rhu_glenn_hotel: 9080,
  douglas_court: 49079,
  banner_plaza_ennis_junction_12: 30589,
  texaco_newcastle: 88622,
  scg_cobh_golf_club: 10519,
  scg_dundalk_golf_club: 8343,
  the_cope_shopping_centre: 3526,
  corrib_oil_cork_city: 17056,
  oran_point_oranmore: 13908
};
for (const [id, aadt] of Object.entries(expected)) {
  assert.ok(byId[id], `${id} should exist in portfolio library`);
  assert.equal(byId[id].aadt, aadt, `${id} AADT should use curated mapping`);
  assert.ok(Array.isArray(byId[id].aadtCounterIds) && byId[id].aadtCounterIds.length >= 1, `${id} should expose counter IDs`);
  assert.ok(byId[id].aadtAggregationMethod, `${id} should expose aggregation method`);
  assert.ok(byId[id].aadtBasisNote, `${id} should expose AADT basis note`);
}
assert.equal(PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio).filter(s => Number(s.aadt || 0) <= 0).length, 0, 'No mapped portfolio site should have zero AADT');
assert.ok(PORTFOLIO_CALIBRATION_SITES.filter(s => s.displayInPortfolio !== false && !s.retiredFromPortfolio).every(s => s.aadtCounter && String(s.aadtCounter).includes('TII')), 'Every mapped site should show a TII AADT source label');
console.log('AADT mapping static regression passed.');
