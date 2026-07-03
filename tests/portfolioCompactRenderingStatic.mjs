import fs from 'node:fs';

const app = fs.readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/styles.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');

const requiredAppTokens = [
  'function portfolioCategoryCompactLabel',
  'function portfolioCategoryCell',
  'function portfolioMaturityBadgeCompact',
  'function portfolioCuratorProfile',
  'portfolioCategoryCell(r)',
  'portfolioMaturityBadgeCompact(r.site.maturity?.tier)',
  'data-portfolio-variance-trigger'
];
for (const token of requiredAppTokens) {
  if (!app.includes(token)) throw new Error(`Missing compact portfolio rendering app token: ${token}`);
}

const requiredCssTokens = [
  'v35.54 portfolio calibration: active curator profiles',
  'min-width: 1180px',
  '.portfolio-category-label',
  'text-overflow: ellipsis',
  'white-space: nowrap'
];
for (const token of requiredCssTokens) {
  if (!css.includes(token)) throw new Error(`Missing compact portfolio rendering CSS token: ${token}`);
}

if (!html.includes('17.9-portfolio-financial-revenue-labels-20260703')) throw new Error('Compact rendering cache-busting version tag missing.');
console.log('Portfolio compact rendering static regression passed.');
