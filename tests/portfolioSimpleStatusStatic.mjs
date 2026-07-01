import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const exportEngine = fs.readFileSync(new URL('../js/engines/exportEngine.js', import.meta.url), 'utf8');

const requiredTokens = [
  'The previous Status column has been removed',
  'portfolioCuratorProfile',
  'portfolioCuratorPopoverText',
  'data-curator',
  'Curator framework enabled with neutral 1.00× defaults',
  'Calibration flag',
  'Variance is the model-fit signal'
];
for (const token of requiredTokens) {
  if (!app.includes(token)) throw new Error(`Missing portfolio status-removal/curator token: ${token}`);
}

const forbiddenTableTokens = [
  'portfolioSortHeader("performance", "Status")',
  'portfolioMultiFilter("portfolioPerformance"',
  'Status is kept simple: Monitor, Ramp-up, Pressure, Review or No actual',
  'Ramp ↑',
  'Ramp ↓',
  'Ramp ⚠',
  'Ramp-up outperform',
  'Ramp-up under',
  'Under-capturing',
  'Outperforming',
  'Capacity pressure / outperforming'
];
for (const token of forbiddenTableTokens) {
  if (app.includes(token) || exportEngine.includes(token)) throw new Error(`Removed/noisy portfolio status token should not appear: ${token}`);
}

if (exportEngine.includes('"Status", "Action year"')) throw new Error('XLSX portfolio export should not include the old Status column.');
if (exportEngine.includes('"Variance", "Status"')) throw new Error('PDF portfolio table should not include the old Status column.');
if (!exportEngine.includes('"Curator modifier"')) throw new Error('XLSX portfolio export should include curator audit columns.');

console.log('Portfolio status removal and curator framework static regression passed.');
