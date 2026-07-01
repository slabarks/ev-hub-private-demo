import assert from 'node:assert/strict';
import { PORTFOLIO_CALIBRATION_SITES } from '../js/data/operatingHubCalibrationLibrary.js';
import { DEFAULT_INPUTS } from '../js/data/defaultAssumptions.js';
import { deriveConfiguration, validateConfiguration } from '../js/engines/technicalEngine.js';

const byId = Object.fromEntries(PORTFOLIO_CALIBRATION_SITES.map(s => [s.id, s]));
for (const [id, plugs, model, count] of [
  ['mallow_plaza', 4, 'Autel DH480 — 480 kW', 2],
  ['axis_retail_park', 4, 'Autel DH480 — 480 kW', 2],
  ['charleville_park_hotel', 4, 'Autel DH480 — 480 kW', 2],
  ['castletroy_park_hotel', 4, 'Autel DH480 — 480 kW', 2],
  ['newtown_park_hotel', 4, 'Autel DH480 — 480 kW', 2],
  ['o_brien_s_larkin_s_cross', 4, 'Autel DH480 — 480 kW', 2],
  ['corrib_oil_swinford', 2, 'Autel DH480 — 480 kW', 1],
  ['supervalu_tipperary', 2, 'Autel DH480 — 480 kW', 1],
  ['ahern_s_centra_castlemartyr', 2, 'Autel DH240 — 240 kW', 1],
  ['aherns_centra_carrigtwohill', 2, 'Autel DH240 — 240 kW', 1]
]) {
  const site = byId[id];
  assert.ok(site, `${id} should exist`);
  assert.equal(site.modelEquivalentPlugs, plugs, `${id} model plugs`);
  assert.equal(site.modelConfig.chargerModel, model, `${id} charger model`);
  assert.equal(site.modelConfig.chargerCount, count, `${id} charger count`);
  assert.equal(deriveConfiguration(site.modelConfig, DEFAULT_INPUTS).installedOutputs, plugs, `${id} derived plugs`);
  assert.equal(validateConfiguration(site.modelConfig).valid, true, `${id} config must validate`);
}
assert.equal(byId.douglas_court.modelEquivalentPlugs, 4, 'Douglas Court must remain 4 active plugs');
assert.equal(deriveConfiguration(byId.douglas_court.modelConfig, DEFAULT_INPUTS).installedOutputs, 4, 'Douglas Court derived active plugs');
assert.equal(byId.banner_plaza_ennis_junction_12.modelConfig.kempowerTripleCabinetCount, 1, 'Banner current live state uses one active triple cabinet');
assert.equal(byId.banner_plaza_ennis_junction_12.modelEquivalentPlugs, 4, 'Banner current live state uses four active plugs');
assert.equal(byId.banner_plaza_ennis_junction_12.fullBuildConfig.kempowerTripleCabinetCount, 2, 'Banner full design keeps two triple cabinets');
assert.equal(byId.anner_hotel_120_kw_dc.retiredFromPortfolio, true, 'Anner must be retired from active portfolio');
assert.equal(byId.killashee_house_hotel.displayInPortfolio, false, 'Killashee must be future-only');
console.log('Hardware mapping static regression passed.');
