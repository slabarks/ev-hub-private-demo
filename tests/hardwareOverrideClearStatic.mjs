import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveConfiguration } from '../js/engines/technicalEngine.js';
import { DEFAULT_INPUTS } from '../js/data/defaultAssumptions.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

assert.ok(app.includes('hardwareConfigKeys'), 'App should define hardware config keys that clear actual power overrides.');
assert.ok(app.includes('delete state.config.actualInstalledPowerKwOverride'), 'Changing hardware should clear stale actual installed power override.');

const manualHardware = {
  platform: 'Autel Standalone',
  chargerModel: 'Autel DH480 — 320 kW',
  chargerCount: 4,
  cabinetType: 'N/A',
  dispenserCount: 0,
  kempowerTripleCabinetCount: 'N/A',
  batteryStrategy: 'Grid + battery',
  batterySize: 'Autel 3×125kW/783kWh',
  selectedMicKva: 100,
  serviceLevel: 'Premium',
  chargerWarrantyYears: 0,
  batteryWarrantyYears: 0
};

const derived = deriveConfiguration(manualHardware, DEFAULT_INPUTS);
assert.equal(derived.installedChargerPowerKw, 1280, '4 x Autel DH480 320 kW should produce 1280 kW when no override is active.');

const overridden = deriveConfiguration({ ...manualHardware, actualInstalledPowerKwOverride: 180 }, DEFAULT_INPUTS);
assert.equal(overridden.installedChargerPowerKw, 180, 'Verified-site actual power override should still work when intentionally present.');

console.log('Hardware output override clearing regression passed.');
