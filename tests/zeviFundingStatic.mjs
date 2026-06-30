import fs from 'node:fs';
import { ZEVI_CONFIRMED_FUNDING, ZEVI_ALLOCATION_REFERENCE, zeviFundingForSite } from '../js/data/zeviFundingLibrary.js';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');

if (ZEVI_CONFIRMED_FUNDING.length !== 11) throw new Error(`Expected 11 confirmed funding records, found ${ZEVI_CONFIRMED_FUNDING.length}`);
if (ZEVI_ALLOCATION_REFERENCE.length !== 47) throw new Error(`Expected 47 allocation reference records, found ${ZEVI_ALLOCATION_REFERENCE.length}`);

const banner = zeviFundingForSite({ id: 'banner_plaza_ennis_junction_12', name: 'Banner Plaza Ennis Junction 12' }, { allowAllocationExact: true });
if (!banner || banner.grantAmount !== 244682 || !banner.autoApply) throw new Error('Banner Plaza confirmed ZEVI funding should auto-apply at €244,682.');

const supervalu = zeviFundingForSite({ id: 'supervalu_tipperary', name: 'Supervalu - Tipperary' }, { allowAllocationExact: true });
if (!supervalu || supervalu.grantAmount !== 79870 || !supervalu.autoApply) throw new Error('Supervalu Tipperary confirmed ZEVI funding should auto-apply at €79,870.');

const duplicate = zeviFundingForSite({ name: 'EMO OIL SERVICE STATION' }, { allowAllocationExact: true });
if (!duplicate || duplicate.autoApply) throw new Error('Duplicate/generic EMO allocation must not auto-apply.');

const generic = zeviFundingForSite({ name: 'TIPPERARY' }, { allowAllocationExact: true });
if (!generic || generic.autoApply) throw new Error('Generic Tipperary allocation must not auto-apply without confirmed portfolio context.');

const safeFuture = zeviFundingForSite({ name: 'BLUEBALL TEXACO SERVICE STATION' }, { allowAllocationExact: true });
if (!safeFuture || safeFuture.grantAmount !== 97273 || !safeFuture.autoApply) throw new Error('Safe exact future allocation should auto-apply.');

for (const token of ['zeviFundingForSite', 'grantSupportField', 'ZEVI grant auto-applied', 'grantSupportSuggestion']) {
  if (!app.includes(token)) throw new Error(`Missing ZEVI app integration token: ${token}`);
}

console.log('ZEVI funding static regression passed.');
