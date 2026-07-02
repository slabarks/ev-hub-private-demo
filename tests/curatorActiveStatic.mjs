import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const exportEngine = fs.readFileSync(new URL('../js/engines/exportEngine.js', import.meta.url), 'utf8');

for (const siteKey of [
  'the_cope_shopping_centre',
  'greenhills_hotel',
  'walsh_s_centra_service_station_roscommon',
  'corrib_oil_cork_city',
  'corrib_oil_swinford'
]) {
  assert.ok(app.includes(`"${siteKey}"`), `App curator profile missing ${siteKey}`);
  assert.ok(exportEngine.includes(`"${siteKey}"`), `Export curator profile missing ${siteKey}`);
}

assert.ok(app.includes('modelKwh *= curatorMultiplier'), 'Portfolio model kWh must be multiplied by active curator multiplier.');
assert.ok(app.includes('modelSessions *= curatorMultiplier'), 'Portfolio model sessions must be multiplied by active curator multiplier.');
assert.ok(app.includes('Reviewed modifier active'), 'Variance popover should identify active reviewed modifiers.');

assert.ok(app.includes('function portfolioCuratorSlug'), 'App must normalize site names to curator slugs.');
assert.ok(app.includes('return portfolioCuratorSlug(site?.name || "")'), 'Curator profile lookup must use slugged site names, not raw lowercase names.');
assert.ok(app.includes('replace(/[^a-z0-9]+/g, "_")'), 'Curator slug must convert punctuation/spaces to underscores for reviewed profile keys.');
assert.ok(exportEngine.includes('function pdfPortfolioToken'), 'Export engine must retain slugged curator lookup.');
assert.ok(exportEngine.includes('modelKwh *= curatorMultiplier'), 'Export model kWh must be multiplied by active curator multiplier.');
assert.ok(exportEngine.includes('pdfPortfolioCuratorNote'), 'XLSX export should include active curator audit notes.');

console.log('Active curator static regression passed.');
