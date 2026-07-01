import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('js/app.js', 'utf8');
for (const token of [
  'positiveLiveNumber',
  'zeroOverwriteBlocked',
  'missing_from_latest_upload',
  'portfolioActualSourceLabel',
  'Actuals retained'
]) {
  assert.ok(app.includes(token), `Missing live upload merge-safety token: ${token}`);
}
assert.ok(!/actual:\s*\{\s*\.\.\.\(site\.actual \|\| \{\}\),\s*\.\.\.liveActual\s*\}/.test(app), 'Live upload must not blindly spread zero/blank uploaded actuals over existing actuals');

assert.ok(app.includes('portfolioExcludedFromActivePortfolio'), 'Portfolio upload flow must include explicit exclusion logic');
assert.ok(app.includes('excludeFromLiveUploads'), 'Portfolio upload flow must ignore excluded mixed AC/DC sites');
assert.ok(app.includes('Low data'), 'Variance badge must show Low data when actual exists but is below the confidence threshold');
assert.ok(app.includes('annualVarianceSuppressedReason'), 'Portfolio results must track why variance was suppressed');
console.log('Live upload merge-safety static regression passed.');
