import assert from 'node:assert/strict';
import { DEFAULT_INPUTS } from '../js/data/defaultAssumptions.js';
import { deriveConfiguration, validateConfiguration, initialCapexDetail } from '../js/engines/technicalEngine.js';

const base = {
  platform: 'Kempower Distributed', batteryStrategy: 'Grid only', batterySize: 'No battery', chargerModel: 'N/A', chargerCount: 'N/A', cabinetType: 'Kempower Triple Cabinet', dispenserCount: 4, serviceLevel: 'Premium', selectedMicKva: 800, chargerWarrantyYears: 0, batteryWarrantyYears: 0
};
const one = { ...base, kempowerTripleCabinetCount: 1 };
const two = { ...base, kempowerTripleCabinetCount: 2 };
assert.equal(validateConfiguration(one).valid, true, '1 × triple cabinet config should validate');
assert.equal(validateConfiguration(two).valid, true, '2 × triple cabinet config should validate');
assert.equal(deriveConfiguration(one, DEFAULT_INPUTS).installedChargerPowerKw, 600, '1 × triple cabinet should provide 600 kW with four satellites');
assert.equal(deriveConfiguration(two, DEFAULT_INPUTS).installedChargerPowerKw, 1200, '2 × triple cabinets should provide 1200 kW with four satellites');
assert.equal(deriveConfiguration(two, DEFAULT_INPUTS).installedOutputs, 8, 'Adding a second triple cabinet must not automatically increase plug count');
assert.ok(initialCapexDetail(two, DEFAULT_INPUTS).cabinetHw > initialCapexDetail(one, DEFAULT_INPUTS).cabinetHw, 'Second triple cabinet should increase cabinet hardware CAPEX');
const eightSats = { ...two, dispenserCount: 8 };
assert.equal(validateConfiguration(eightSats).valid, true, '2 × triple cabinet should allow up to eight dual satellites');
assert.equal(deriveConfiguration(eightSats, DEFAULT_INPUTS).installedOutputs, 16, 'Eight dual satellites should derive sixteen plugs');
console.log('Kempower triple cabinet quantity regression passed.');
