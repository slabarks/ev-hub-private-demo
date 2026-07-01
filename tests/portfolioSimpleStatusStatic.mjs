import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const exportEngine = fs.readFileSync(new URL('../js/engines/exportEngine.js', import.meta.url), 'utf8');

const requiredTokens = [
  'Status is kept simple: Monitor, Ramp-up, Pressure, Review or No actual',
  'function portfolioPerformanceInfo',
  'label: "Pressure"',
  'label: "Ramp-up"',
  'label: "Monitor"',
  'label: "Review"',
  'label: "No actual"',
  'data-low-data-note',
  'Variance is the model-fit signal'
];
for (const token of requiredTokens) {
  if (!app.includes(token)) throw new Error(`Missing simple status app token: ${token}`);
}

const forbiddenTableLabels = [
  'Ramp ↑',
  'Ramp ↓',
  'Ramp ⚠',
  'Ramp-up outperform',
  'Ramp-up under',
  'Under-capturing',
  'Outperforming',
  'Capacity pressure / outperforming'
];
for (const token of forbiddenTableLabels) {
  if (app.includes(token) || exportEngine.includes(token)) throw new Error(`Noisy portfolio status label should not appear: ${token}`);
}

if (!exportEngine.includes('return "Pressure";')) throw new Error('PDF portfolio export should use compact Pressure label.');
if (!exportEngine.includes('? "Review" : "Ramp-up"')) throw new Error('PDF portfolio export should use compact Ramp-up label.');
if (!exportEngine.includes('return "No actual";')) throw new Error('PDF portfolio export should support No actual status.');

console.log('Portfolio simple status static regression passed.');
