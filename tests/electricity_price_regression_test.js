#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const app = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');

function extract(name, nextName) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const end = nextName ? app.indexOf(`function ${nextName}(`, start + 1) : -1;
  assert.ok(end > start, `end marker for ${name} must exist`);
  return app.slice(start, end);
}

const source = [
  extract('portfolioCommercialTermsKey', 'portfolioCommercialTermsStorageKey'),
  extract('portfolioElectricityGlobalStorageKey', 'portfolioElectricitySiteStorageKey'),
  extract('portfolioElectricitySiteStorageKey', 'portfolioElectricityModelDefault'),
  extract('portfolioElectricityModelDefault', 'portfolioElectricityPriceSanitise'),
  extract('portfolioElectricityPriceSanitise', 'portfolioElectricityGlobalLoad'),
  extract('portfolioElectricityGlobalLoad', 'portfolioElectricityGlobalSave'),
  extract('portfolioElectricityGlobalSave', 'portfolioElectricityGlobalReset'),
  extract('portfolioElectricityGlobalReset', 'portfolioElectricitySiteLoad'),
  extract('portfolioElectricitySiteLoad', 'portfolioElectricitySiteSave'),
  extract('portfolioElectricitySiteSave', 'portfolioElectricitySiteClear'),
  extract('portfolioElectricitySiteClear', 'portfolioElectricityClearAllSiteOverrides'),
  extract('portfolioElectricityClearAllSiteOverrides', 'portfolioElectricityEffective'),
  extract('portfolioElectricityEffective', 'portfolioElectricitySummary'),
  extract('portfolioElectricitySummary', 'portfolioElectricityModalKey'),
].join('\n');

class Storage {
  constructor(){ this.map = new Map(); }
  getItem(k){ return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k,v){ this.map.set(String(k), String(v)); }
  removeItem(k){ this.map.delete(String(k)); }
  key(i){ return [...this.map.keys()][i] ?? null; }
  get length(){ return this.map.size; }
}

const localStorage = new Storage();
const context = {
  localStorage,
  state: { inputs: { electricityCost: 0.25 } },
  DEFAULT_INPUTS: { electricityCost: 0.25 },
  PORTFOLIO_FINANCIAL_STORAGE_PREFIX: 'evHub.portfolioFinancials.v21_1',
  Date,
  Math,
  Number,
  JSON,
  Object,
  String,
};
vm.createContext(context);
vm.runInContext(`${source}; this.api={portfolioElectricityGlobalLoad,portfolioElectricityGlobalSave,portfolioElectricityGlobalReset,portfolioElectricitySiteLoad,portfolioElectricitySiteSave,portfolioElectricitySiteClear,portfolioElectricityClearAllSiteOverrides,portfolioElectricityEffective,portfolioElectricitySummary,portfolioElectricityPriceSanitise};`, context);
const api = context.api;
const banner = { name: 'Banner Plaza' };
const greenhills = { name: 'Greenhills Hotel' };

assert.equal(api.portfolioElectricityGlobalLoad(), 0.25);
assert.equal(api.portfolioElectricityPriceSanitise(0.26384), 0.2638);
assert.equal(api.portfolioElectricityGlobalSave(0.2638), 0.2638);
assert.equal(api.portfolioElectricityGlobalLoad(), 0.2638);
assert.deepEqual(JSON.parse(JSON.stringify(api.portfolioElectricityEffective(banner))), {
  price: 0.2638, globalPrice: 0.2638, isOverride: false, source: 'portfolio price', note: '', updatedAt: null
});
api.portfolioElectricitySiteSave(banner, { enabled: true, price: 0.2764, note: 'Flogas site bill' });
assert.equal(api.portfolioElectricityEffective(banner).price, 0.2764);
assert.equal(api.portfolioElectricityEffective(banner).isOverride, true);
assert.equal(api.portfolioElectricityEffective(greenhills).price, 0.2638);
api.portfolioElectricityGlobalSave(0.2417);
assert.equal(api.portfolioElectricityEffective(banner).price, 0.2764, 'global changes must preserve site override');
assert.equal(api.portfolioElectricityEffective(greenhills).price, 0.2417);
const summary = api.portfolioElectricitySummary([
  { site: banner, next12mKwh: 100, electricityUnitCost: 0.2764 },
  { site: greenhills, next12mKwh: 300, electricityUnitCost: 0.2417 },
]);
assert.equal(summary.overrides, 1);
assert.equal(summary.globalSites, 1);
assert.ok(Math.abs(summary.weightedAverage - 0.250375) < 1e-9);
api.portfolioElectricitySiteClear(banner);
assert.equal(api.portfolioElectricityEffective(banner).price, 0.2417);
api.portfolioElectricitySiteSave(banner, { enabled: true, price: 0.3 });
api.portfolioElectricitySiteSave(greenhills, { enabled: true, price: 0.31 });
api.portfolioElectricityClearAllSiteOverrides();
assert.equal(api.portfolioElectricitySiteLoad(banner).enabled, false);
assert.equal(api.portfolioElectricitySiteLoad(greenhills).enabled, false);
api.portfolioElectricityGlobalReset();
assert.equal(api.portfolioElectricityGlobalLoad(), 0.25);

assert.match(app, /data-electricity-global-form/);
assert.match(app, /data-electricity-modal-open/);
assert.match(app, /data-electricity-override-price/);
assert.match(app, /electricityPriceSource/);
assert.match(app, /portfolioElectricityEffective\(site, inputs\.electricityCost\)/);
assert.match(app, /Portfolio electricity price EUR\/kWh/);
assert.match(app, /Effective electricity unit cost EUR\/kWh/);
console.log('PASS — portfolio global electricity price, site overrides, precedence, precision, summary and export guards');
