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
console.log('Live upload merge-safety static regression passed.');
